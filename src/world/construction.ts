import type { City, World } from "./types";
import { getBuildCost, getBuildTime, type EraState, ERA_CONFIGS } from "./era";

export type ConstructionProject = {
  id: string;
  cityId?: string;
  nationId: string;
  provinceId: string;
  era: string;
  cost: Record<string, number>;
  remainingTurns: number;
  status: "building" | "complete" | "abandoned";
  startedAt: number;
};

export function createConstructionProject(
  nationId: string,
  provinceId: string,
  era: string,
  isCapital: boolean,
): ConstructionProject {
  const cost = getBuildCost(era, isCapital);
  const buildTime = getBuildTime(era);
  return {
    id: `construction-${nationId}-${provinceId}-${Date.now()}`,
    nationId,
    provinceId,
    era,
    cost,
    remainingTurns: buildTime,
    status: "building",
    startedAt: 0,
  };
}

export function progressConstruction(
  projects: ConstructionProject[],
  stockpiles: Record<string, { gold: number; resources: Record<string, number> }>,
  currentMonth: number,
): { projects: ConstructionProject[]; completed: ConstructionProject[] } {
  const completed: ConstructionProject[] = [];

  for (const project of projects) {
    if (project.status !== "building") continue;

    const canAfford = canAffordProject(project, stockpiles[project.nationId]);
    if (!canAfford) continue;

    project.remainingTurns -= 1;
    if (project.remainingTurns <= 0) {
      project.status = "complete";
      completed.push(project);
    }
  }

  return { projects, completed };
}

function canAffordProject(
  project: ConstructionProject,
  stockpile: { gold: number; resources: Record<string, number> } | undefined,
): boolean {
  if (!stockpile) return false;
  if (stockpile.gold < (project.cost.gold ?? 0)) return false;
  for (const [resource, amount] of Object.entries(project.cost)) {
    if ((stockpile.resources[resource] ?? 0) < amount) return false;
  }
  return true;
}

export function checkNewCity(
  city: City,
  world: World,
  eraStates: Record<string, EraState>,
): boolean {
  const province = world.provinceById.get(city.provinceId);
  const tile = world.tiles.find((t) => t.x === city.x && t.y === city.y);
  if (!tile || tile.populationOnTile === undefined || tile.populationOnTile < 10) {
    return false;
  }

  const nationId = city.nationId;
  const eraState = eraStates[nationId];
  if (!eraState) return false;

  const nationCityCount = world.cities.filter((c) => c.nationId === nationId).length;
  const config = ERA_CONFIGS[eraState.currentEra];
  if (config && nationCityCount < config.unlockCities) {
    return false;
  }

  return true;
}
