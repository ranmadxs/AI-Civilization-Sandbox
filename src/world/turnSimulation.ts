import { buildInitialDiplomacyState, evaluateDiplomaticProposalsWithEvents, executeDiplomacyPoliciesWithEvents, executePeacefulExpansion } from "./diplomacy";
import { consumeResources, type HungerState } from "./hunger";
import type { GameEvent } from "./events";
import { isNationActive } from "./nationStatus";
import { advanceNationPolicies, buildInitialNationPolicies, type NationPolicyState } from "./policyAI";
import { buildInitialNationRelations, type NationRelations } from "./relationships";
import { applyPopulationDynamics, buildInitialNationStockpiles, settleNationStockpiles, type NationStockpile } from "./settlement";
import { advanceSpyNetwork, buildInitialSpyNetworkWithEvents, type SpyNetwork } from "./spies";
import {
  buildInitialMarketState,
  executeTransactions,
  generateOffers,
  type MarketState,
} from "./market";
import { buildInitialCurrencyState, type CurrencyState } from "./currency";
import { buildInitialEraStates, type EraState } from "./era";
import { buildInitialChatState, type ChatState } from "./chat";
import { enforceProvinceMilitaryLimits, handleDeserters } from "./provinceLimits";
import type { World } from "./types";
import { advanceArmyGroups, advanceMilitaryEconomy, advanceWarSystem, buildInitialMilitaryState, type MilitaryState } from "./war";

export type SimulationState = {
  defeatedNations: Record<string, DefeatedNationRecord>;
  diplomacy: ReturnType<typeof buildInitialDiplomacyState>;
  elapsedMonths: number;
  events: GameEvent[];
  mapRevision: number;
  military: MilitaryState;
  nationPolicies: Record<string, NationPolicyState>;
  nationRelations: NationRelations;
  nationStockpiles: Record<string, NationStockpile>;
  spies: SpyNetwork;
  marketState: MarketState;
  hungerState: HungerState;
  eraState: Record<string, EraState>;
  chatLog: ChatState;
  currencyState: CurrencyState;
};

export type DefeatedNationRecord = {
  defeatedAtMonth: number;
  defeatedNationId: string;
  victorNationId: string;
};

export type NationTurnContext = {
  nationId: string;
  turnNumber: number;
  world: World;
  simulation: Readonly<SimulationState>;
};

export type TurnProgress = {
  turnNumber: number;
  activeNationId?: string;
  completedNationIds: string[];
  totalNations: number;
  phase: "idle" | "acting" | "resolving";
};

export type NationTurnExecutor = (context: NationTurnContext) => Promise<void>;

export function createInitialSimulationState(world: World): SimulationState {
  const nationRelations = buildInitialNationRelations(world);
  const nationStockpiles = buildInitialNationStockpiles(world);
  const nationPolicies = buildInitialNationPolicies(world, nationRelations, nationStockpiles, 0);
  const initialSpies = buildInitialSpyNetworkWithEvents(world, nationPolicies);
  return {
    defeatedNations: {},
    diplomacy: buildInitialDiplomacyState(world),
    elapsedMonths: 0,
    events: initialSpies.events,
    mapRevision: 0,
    military: buildInitialMilitaryState(world),
    nationPolicies,
    nationRelations,
    nationStockpiles,
    spies: initialSpies.spyNetwork,
    marketState: buildInitialMarketState(0),
    hungerState: {
      globalFoodConsumption: 0,
      globalWaterConsumption: 0,
      totalDeaths: 0,
      provincesAtRisk: [],
    },
    eraState: buildInitialEraStates(world),
    chatLog: buildInitialChatState(),
    currencyState: buildInitialCurrencyState(world),
  };
}

export async function advanceSimulationTurn(
  world: World,
  current: SimulationState,
  executeNationAction: NationTurnExecutor = async () => undefined,
  onProgress?: (progress: TurnProgress) => void,
): Promise<SimulationState> {
  const turnNumber = current.elapsedMonths + 1;
  const activeNations = world.nations.filter((nation) => isNationActive(world, nation.id));
  const completedNationIds: string[] = [];

  const marketStartState = {
    ...current,
    marketState: {
      ...current.marketState,
      currentPhase: "MARKET_START" as const,
      currentTurn: turnNumber,
      offers: generateOffers(
        current.marketState.offers,
        world.nations.map((n) => n.id),
        turnNumber,
      ),
    },
  };

  for (const nation of activeNations) {
    onProgress?.({ turnNumber, activeNationId: nation.id, completedNationIds: [...completedNationIds], totalNations: activeNations.length, phase: "acting" });
    await executeNationAction({ nationId: nation.id, turnNumber, world, simulation: marketStartState });
    completedNationIds.push(nation.id);
  }

  const afterHunger = processHunger(world, marketStartState);
  onProgress?.({ turnNumber, completedNationIds: [...completedNationIds], totalNations: activeNations.length, phase: "resolving" });
  return resolveTurn(world, afterHunger, turnNumber);
}

function processHunger(
  world: World,
  current: SimulationState,
): SimulationState {
  const consumption = consumeResources(world, current.nationStockpiles, current.elapsedMonths);
  const totalDeaths = consumption.deaths;
  const provincesAtRisk = consumption.provincesAtRisk;

  return {
    ...current,
    hungerState: {
      globalFoodConsumption: consumption.globalFoodConsumption ?? 0,
      globalWaterConsumption: consumption.globalWaterConsumption ?? 0,
      totalDeaths,
      provincesAtRisk,
    },
    events: [...current.events, ...(totalDeaths > 0 ? [{
      id: `event-hunger-${current.elapsedMonths}`,
      month: current.elapsedMonths,
      kind: "hunger" as const,
      title: "Starvation",
      description: `${totalDeaths} people died from lack of resources.`,
      nationIds: provincesAtRisk,
    }] : [])],
  };
}

function resolveTurn(world: World, current: SimulationState, nextMonth: number): SimulationState {
  const currentMonth = current.elapsedMonths;
  const nationStockpiles = settleNationStockpiles(world, current.nationStockpiles, 1);
  const nationPolicies = advanceNationPolicies(world, current.nationRelations, nationStockpiles, current.nationPolicies, currentMonth, nextMonth);
  const militaryEconomy = advanceMilitaryEconomy(world, current.military, nationStockpiles, nationPolicies, current.diplomacy, nextMonth, 1);
  const spyUpdate = advanceSpyNetwork(current.spies, nationPolicies, current.nationRelations, world, nextMonth);
  const execution = executeDiplomacyPoliciesWithEvents(current.diplomacy, nationPolicies, world, nextMonth);
  const evaluation = evaluateDiplomaticProposalsWithEvents(execution.diplomacy, world, spyUpdate.relations, nextMonth);
  const peacefulEvents = executePeacefulExpansion(world, nationPolicies, nationStockpiles, nextMonth);
  const movementUpdate = advanceArmyGroups(world, evaluation.diplomacy, militaryEconomy.military, nextMonth);
  const warUpdate = advanceWarSystem(world, evaluation.diplomacy, movementUpdate.military, spyUpdate.relations, spyUpdate.spyNetwork, militaryEconomy.stockpiles, nextMonth);
  applyPopulationDynamics(world, warUpdate.diplomacy, nextMonth);

  let updatedMilitary = warUpdate.military;
  const deserterUpdate = handleDeserters(world, updatedMilitary, nextMonth);
  updatedMilitary = deserterUpdate.military;

  const newEvents = [
    ...militaryEconomy.events,
    ...spyUpdate.events,
    ...execution.events,
    ...evaluation.events,
    ...movementUpdate.events,
    ...warUpdate.events,
    ...peacefulEvents,
    ...deserterUpdate.events,
  ];

  const marketEndResult = executeTransactions(current.marketState, nextMonth);

  const newDefeatedNations = collectDefeatedNationRecords(current.defeatedNations, newEvents);
  return {
    defeatedNations: newDefeatedNations,
    diplomacy: warUpdate.diplomacy,
    elapsedMonths: nextMonth,
    events: [...current.events, ...newEvents].slice(-240),
    mapRevision: current.mapRevision + (warUpdate.mapChanged || movementUpdate.mapChanged ? 1 : 0),
    military: updatedMilitary,
    nationPolicies,
    nationRelations: warUpdate.relations,
    nationStockpiles: warUpdate.stockpiles,
    spies: spyUpdate.spyNetwork,
    marketState: marketEndResult.marketState,
    hungerState: current.hungerState,
    eraState: current.eraState,
    chatLog: current.chatLog,
    currencyState: current.currencyState,
  };
}

function collectDefeatedNationRecords(
  currentRecords: Record<string, DefeatedNationRecord>,
  events: GameEvent[],
) {
  let records = currentRecords;
  for (const event of events) {
    if (event.kind !== "nation_defeated" || event.nationIds.length < 2) {
      continue;
    }
    const [victorNationId, defeatedNationId] = event.nationIds;
    if (records[defeatedNationId]) {
      continue;
    }
    records = {
      ...records,
      [defeatedNationId]: { defeatedAtMonth: event.month, defeatedNationId, victorNationId },
    };
  }
  return records;
}
