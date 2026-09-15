import type { World } from "./types";

export type EraState = {
  nationId: string;
  currentEra: "stone" | "medieval" | "modern";
  citiesBuiltInEra: string[];
  eraProgress: number;
  unlockedAt: number;
};

export type EraConfig = {
  name: "stone" | "medieval" | "modern";
  costs: Record<string, number>;
  unlockCities: number;
  buildTime: number;
  unitFactor: number;
};

export const ERA_CONFIGS: Record<string, EraConfig> = {
  stone: {
    name: "stone",
    costs: { wood: 10, stone: 5 },
    unlockCities: 0,
    buildTime: 1,
    unitFactor: 1.0,
  },
  medieval: {
    name: "medieval",
    costs: { wood: 20, iron: 10, gold: 5 },
    unlockCities: 5,
    buildTime: 2,
    unitFactor: 1.3,
  },
  modern: {
    name: "modern",
    costs: { wood: 30, iron: 25, gold: 15, steel: 10 },
    unlockCities: 15,
    buildTime: 5,
    unitFactor: 1.8,
  },
};

export function getNationEra(nationId: string, eraStates: Record<string, EraState>): string {
  const state = eraStates[nationId];
  return state ? state.currentEra : "stone";
}

export function checkEraUnlock(
  nationId: string,
  cityCount: number,
  currentEra: string,
  eraStates: Record<string, EraState>,
  allCitiesBuiltInEra: boolean,
): { unlocked: boolean; newEra?: string } {
  if (currentEra === "stone" && cityCount >= ERA_CONFIGS.medieval.unlockCities) {
    return { unlocked: true, newEra: "medieval" };
  }
  if (currentEra === "medieval" && cityCount >= ERA_CONFIGS.modern.unlockCities && allCitiesBuiltInEra) {
    return { unlocked: true, newEra: "modern" };
  }
  return { unlocked: false };
}

export function getBuildCost(era: string, isCapital: boolean): Record<string, number> {
  const config = ERA_CONFIGS[era];
  if (!config) return {};
  const cost = { ...config.costs };
  if (isCapital) {
    for (const key of Object.keys(cost)) {
      cost[key] = Math.round(cost[key] * 0.8);
    }
  }
  return cost;
}

export function getBuildTime(era: string): number {
  return ERA_CONFIGS[era]?.buildTime ?? 1;
}

export function buildInitialEraStates(world: World): Record<string, EraState> {
  return Object.fromEntries(
    world.nations.map((nation) => [
      nation.id,
      {
        nationId: nation.id,
        currentEra: "stone",
        citiesBuiltInEra: [],
        eraProgress: 0,
        unlockedAt: 0,
      } as EraState,
    ]),
  );
}
