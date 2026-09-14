import type { Resource, Tile } from "./types";

export type ResourceYield = {
  resource: Resource;
  amount: number;
};

export type ResourceTotals = Partial<Record<Resource, number>>;

export const resourceTypes: Resource[] = ["grain", "timber", "iron", "coal", "oil", "gold", "silver", "copper", "steel"];

const resourceMonthlyOutput: Record<Resource, number> = {
  grain: 10,
  timber: 10,
  iron: 6,
  coal: 22,
  oil: 4,
  water: 120,
  gold: 0.45,
  silver: 0.2,
  copper: 13,
  steel: 0,
};

export const MAX_DENSITY_PER_TILE = 20000;

export const BASE_FOOD_YIELD = 6;
export const BASE_METAL_YIELD = 3;
export const BASE_OIL_YIELD = 2;
export const FOOD_TERRAIN_MULTIPLIER: Record<string, number> = {
  plain: 1.0,
  coast: 1.0,
  forest: 0.8,
  hill: 0.8,
  desert: 0.5,
  mountain: 0.5,
  ocean: 0,
};
export const OPTIMAL_WORKERS = 20;

export function getTileMonthlyYield(tile: Tile): ResourceYield | undefined {
  if (!tile.resource) {
    return undefined;
  }

  return {
    resource: tile.resource,
    amount: resourceMonthlyOutput[tile.resource],
  };
}

export function getDynamicFoodYield(tile: Tile): number {
  if (tile.resource !== "grain") {
    return 0;
  }
  const pop = tile.populationOnTile ?? 0;
  if (pop <= 0) {
    return 0;
  }
  const baseYield = BASE_FOOD_YIELD;
  const multiplier = FOOD_TERRAIN_MULTIPLIER[tile.terrain] ?? 0.5;
  return baseYield * Math.log(1 + pop) * multiplier;
}

export function getDynamicMetalYield(tile: Tile): number {
  if (!tile.resource || (tile.resource !== "iron" && tile.resource !== "coal")) {
    return 0;
  }
  const workers = tile.workersOnTile ?? 0;
  if (workers <= 0) {
    return 0;
  }
  const baseYield = BASE_METAL_YIELD;
  return baseYield * Math.min(1, workers / OPTIMAL_WORKERS) * Math.log(1 + workers);
}

export function getDynamicOilYield(tile: Tile): number {
  if (tile.resource !== "oil") {
    return 0;
  }
  const workers = tile.workersOnTile ?? 0;
  if (workers <= 0) {
    return 0;
  }
  return BASE_OIL_YIELD * Math.min(1, workers / OPTIMAL_WORKERS) * Math.log(1 + workers);
}

export function getTileYield(tile: Tile): ResourceYield | undefined {
  if (!tile.resource) {
    return undefined;
  }
  const dynamicYield = getDynamicYield(tile);
  if (dynamicYield > 0) {
    return { resource: tile.resource, amount: dynamicYield };
  }
  return getTileMonthlyYield(tile);
}

function getDynamicYield(tile: Tile): number {
  if (tile.resource === "grain") {
    return getDynamicFoodYield(tile);
  }
  if (tile.resource === "iron" || tile.resource === "coal") {
    return getDynamicMetalYield(tile);
  }
  if (tile.resource === "oil") {
    return getDynamicOilYield(tile);
  }
  if (!tile.resource) return 0;
  return resourceMonthlyOutput[tile.resource as Resource] ?? 0;
}

export function addYield(totals: ResourceTotals, yieldValue: ResourceYield) {
  totals[yieldValue.resource] = (totals[yieldValue.resource] ?? 0) + yieldValue.amount;
}

export function formatResourceName(resource: Resource) {
  return resource.charAt(0).toUpperCase() + resource.slice(1);
}

export function isWaterTile(terrain: Tile["terrain"]): boolean {
  return terrain === "coast" || terrain === "ocean";
}
