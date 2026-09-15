import { calculateNationCityEconomy } from "./cityEconomy";
import {
  addYield,
  getTileYield,
  getDynamicFoodYield,
  getDynamicMetalYield,
  getDynamicOilYield,
  isWaterTile,
  MAX_DENSITY_PER_TILE,
  resourceTypes,
  type ResourceTotals,
} from "./economy";
import type { DiplomacyState } from "./diplomacy";
import { isNationActive } from "./nationStatus";
import type { Resource, World } from "./types";

export type NationStockpile = {
  gold: number;
  water: number;
  resources: ResourceTotals;
};

export type NationStockpiles = Record<string, NationStockpile>;

export type NationMonthlyIncome = {
  gold: number;
  water: number;
  resources: ResourceTotals;
};

export function buildInitialNationStockpiles(world: World): NationStockpiles {
  return Object.fromEntries(
    world.nations.map((nation) => {
      const income = calculateNationMonthlyIncome(world, nation.id);
      return [
        nation.id,
        {
          gold: Math.round(income.gold * 3),
          water: Math.round(income.water * 3),
          resources: emptyResources(),
        },
      ];
    }),
  );
}

export function calculateNationMonthlyIncome(world: World, nationId: string): NationMonthlyIncome {
  const provinceIds = new Set(
    world.provinces
      .filter((province) => province.nationId === nationId)
      .map((province) => province.id),
  );
  const resources = emptyResources();
  let totalWater = 0;

  for (const tile of world.tiles) {
    if (!tile.provinceId || !provinceIds.has(tile.provinceId)) {
      continue;
    }

    const yieldValue = getTileYield(tile);
    if (yieldValue) {
      const province = world.provinceById.get(tile.provinceId);
      const provinceCities = world.cities.filter((c) => c.provinceId === tile.provinceId);
      const provincePopulation = provinceCities.reduce((sum, c) => sum + c.population, 0);
      const maxPopulation = province ? province.tileCount * MAX_DENSITY_PER_TILE : 1;
      const overpopRatio = Math.max(0, provincePopulation - maxPopulation) / maxPopulation;
      const multiplier = Math.max(-1, 1 - overpopRatio);
      addYield(resources, { ...yieldValue, amount: yieldValue.amount * multiplier });
    }

    if (isWaterTile(tile.terrain)) {
      totalWater += 120;
    }
  }

  return {
    gold: calculateNationCityEconomy(nationId, world).monthlyGold,
    water: totalWater,
    resources,
  };
}

export function settleNationStockpiles(
  world: World,
  currentStockpiles: NationStockpiles,
  months: number,
): NationStockpiles {
  return Object.fromEntries(
    world.nations.map((nation) => {
      const current = currentStockpiles[nation.id] ?? {
        gold: 0,
        water: 0,
        resources: emptyResources(),
      };
      if (!isNationActive(world, nation.id)) {
        return [nation.id, { gold: 0, water: 0, resources: emptyResources() }];
      }

      const income = calculateNationMonthlyIncome(world, nation.id);

      return [
        nation.id,
        {
          gold: Math.max(0, current.gold + income.gold * months),
          water: Math.max(0, current.water + income.water * months),
          resources: addResourceTotals(current.resources, income.resources, months),
        },
      ];
    }),
  );
}

/** Aplica natalidad/mortalidad segun cada provincia este en guerra o no. */
export function applyPopulationDynamics(
  world: World,
  diplomacy: DiplomacyState,
  currentMonth: number,
): void {
  for (const nation of world.nations) {
    const atWar = diplomacy.wars.some(
      (war) => war.attackerNationId === nation.id || war.defenderNationId === nation.id,
    );
    for (const city of world.cities.filter((city) => city.nationId === nation.id)) {
      const deathRate = atWar
        ? 0.30 + seededRandom(world.seed, `death:${city.id}:${currentMonth}`, currentMonth) * 0.30
        : clampRate(0.10, 0.02, world.seed, `death:${city.id}:${currentMonth}`, currentMonth);
      const birthRate = atWar
        ? 0.002 + seededRandom(world.seed, `birth:${city.id}:${currentMonth}`, currentMonth) * 0.018
        : clampRate(0.15, 0.02, world.seed, `birth:${city.id}:${currentMonth}`, currentMonth);
      city.population = Math.max(
        0,
        Math.round(city.population * (1 - deathRate + birthRate)),
      );
    }
  }
}

function clampRate(base: number, variance: number, seed: string, salt: string, currentMonth: number): number {
  const value = base + (seededRandom(seed, salt, currentMonth) - 0.5) * 2 * variance;
  return Math.max(0, value);
}

function seededRandom(seed: string, salt: string, currentMonth: number): number {
  let hash = 2166136261;
  const value = `${seed}:${salt}:${currentMonth}`;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function addResourceTotals(
  current: ResourceTotals,
  monthlyIncome: ResourceTotals,
  months: number,
) {
  return Object.fromEntries(
    resourceTypes.map((resource) => [
      resource,
      (current[resource] ?? 0) + (monthlyIncome[resource] ?? 0) * months,
    ]),
  ) as ResourceTotals;
}

function emptyResources() {
  return Object.fromEntries(resourceTypes.map((resource) => [resource, 0])) as Record<Resource, number>;
}
