import type { Resource, World } from "./types";

export type HungerState = {
  globalFoodConsumption: number;
  globalWaterConsumption: number;
  totalDeaths: number;
  provincesAtRisk: string[];
};

export const CONSUMPTION_PER_PERSON = {
  grain: 0.01,
  water: 0.001,
};

export const DEATH_TIME_WATER_HOURS = 72;
export const DEATH_TIME_GRAIN_MONTHS = 2;

export function calculateGlobalConsumption(world: World): { foodConsumption: number; waterConsumption: number } {
  let totalPopulation = 0;
  for (const city of world.cities) {
    totalPopulation += city.population;
  }
  for (const province of world.provinces) {
    totalPopulation += province.population;
  }
  return {
    foodConsumption: totalPopulation * CONSUMPTION_PER_PERSON.grain,
    waterConsumption: totalPopulation * CONSUMPTION_PER_PERSON.water,
  };
}

export function consumeResources(
  world: World,
  stockpiles: Record<string, { gold: number; water: number; resources: Record<string, number> }>,
  currentMonth: number,
): { globalFoodConsumption: number; globalWaterConsumption: number; deaths: number; provincesAtRisk: string[] } {
  let totalDeaths = 0;
  const provincesAtRisk: string[] = [];
  let totalFoodConsumption = 0;
  let totalWaterConsumption = 0;

  for (const nation of world.nations) {
    const stockpile = stockpiles[nation.id];
    if (!stockpile) continue;

    const consumption = calculateGlobalConsumption(world);
    const totalPop = world.cities
      .filter((c) => c.nationId === nation.id)
      .reduce((s, c) => s + c.population, 0);

    totalFoodConsumption += consumption.foodConsumption;
    totalWaterConsumption += consumption.waterConsumption;

    const foodConsumed = Math.min(stockpile.resources.grain ?? 0, consumption.foodConsumption);
    const waterConsumed = Math.min(stockpile.water, consumption.waterConsumption);

    stockpile.resources.grain = Math.max(0, (stockpile.resources.grain ?? 0) - consumption.foodConsumption);
    stockpile.water = Math.max(0, stockpile.water - consumption.waterConsumption);

    if (stockpile.water <= 0) {
      totalDeaths += totalPop;
    }
    if (stockpile.resources.grain <= 0) {
      totalDeaths += Math.round(totalPop * 0.5);
    }

    if (stockpile.water <= 0 || (stockpile.resources.grain ?? 0) <= 0) {
      provincesAtRisk.push(nation.id);
    }
  }

  return { globalFoodConsumption: totalFoodConsumption, globalWaterConsumption: totalWaterConsumption, deaths: totalDeaths, provincesAtRisk };
}

export function checkStarvation(
  stockpile: { gold: number; water: number; resources: Record<string, number> },
): { hungerRisk: boolean; thirstRisk: boolean } {
  return {
    thirstRisk: stockpile.water <= 0,
    hungerRisk: (stockpile.resources.grain ?? 0) <= 0,
  };
}

export function processDeaths(
  world: World,
  result: { globalFoodConsumption: number; globalWaterConsumption: number; deaths: number; provincesAtRisk: string[] },
): void {
  if (result.deaths > 0) {
    for (const nation of world.nations) {
      const cities = world.cities.filter((c) => c.nationId === nation.id);
      for (const city of cities) {
        if (city.population > 0) {
          const reduction = Math.min(city.population, Math.round(result.deaths / world.nations.length));
          city.population = Math.max(0, city.population - reduction);
        }
      }
    }
  }
}
