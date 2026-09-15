import type { World } from "./types";

export type ProvinceMilitaryLimit = {
  provinceId: string;
  maxArmySize: number;
  currentArmySize: number;
  hasCities: boolean;
  cityCount: number;
};

const BASE_PROVINCE_CAP = 500;

export const ERA_MILITARY_FACTORS: Record<string, number> = {
  stone: 1.0,
  medieval: 1.3,
  modern: 1.8,
};

export const SOLDIERS_PER_CITY = 200;

export function calculateProvinceMilitaryLimit(
  provinceId: string,
  world: World,
  era: string,
): ProvinceMilitaryLimit {
  const citiesInProvince = world.cities.filter((c) => c.provinceId === provinceId);
  const hasCities = citiesInProvince.length > 0;
  const cityCount = citiesInProvince.length;
  const factor = ERA_MILITARY_FACTORS[era] ?? 1.0;
  const maxArmySize = hasCities
    ? BASE_PROVINCE_CAP * Math.sqrt(cityCount) * factor
    : 0;

  return {
    provinceId,
    maxArmySize,
    currentArmySize: 0,
    hasCities,
    cityCount,
  };
}

export function getAvailableArmySize(
  provinceId: string,
  world: World,
  era: string,
): number {
  const limit = calculateProvinceMilitaryLimit(provinceId, world, era);
  const cityCount = limit.cityCount;
  const ratio = cityCount * SOLDIERS_PER_CITY * (ERA_MILITARY_FACTORS[era] ?? 1.0);
  return Math.min(limit.maxArmySize, ratio);
}

export function hasCitiesForArmy(nationId: string, world: World): boolean {
  return world.cities.some((city) => city.nationId === nationId);
}

export function enforceProvinceMilitaryLimits(
  military: Record<string, any>,
  world: World,
  eraStates: Record<string, string>,
): Record<string, any> {
  return military;
}

export function handleDeserters(
  world: World,
  military: Record<string, any>,
  currentMonth: number,
): { military: Record<string, any>; events: any[] } {
  return { military, events: [] };
}
