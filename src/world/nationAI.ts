import { decideNationPolicy } from "./policyAI";
import type { NationTurnContext, NationTurnExecutor } from "./turnSimulation";
import type { SimulationState } from "./turnSimulation";
import type { World } from "./types";

export function createNationAIExecutor(
  world: World,
): NationTurnExecutor {
  return async function nationAIExecutor(context: NationTurnContext): Promise<void> {
    const { nationId, world: ctxWorld, simulation } = context;
    const nextMonth = context.turnNumber;
    const policy = decideNationPolicy(ctxWorld, simulation.nationRelations, simulation.nationStockpiles, nationId, nextMonth);
    (simulation as any).nationPolicies[nationId] = policy;
  };
}
