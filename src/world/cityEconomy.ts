import { MAX_DENSITY_PER_TILE } from "./economy";
import { CONSUMPTION_PER_PERSON } from "./hunger";
import type { City, Terrain, World } from "./types";

export type CityEconomy = {
  population: number;
  monthlyGold: number;
  army: number;
  defense: number;
  overpopulationRatio: number;
  monthlyConsumption: { grain: number; water: number };
};

export type NationCityEconomy = {
  population: number;
  monthlyGold: number;
  army: number;
  maxDefense: number;
  monthlyConsumption: { grain: number; water: number };
};

/** Impuesto base del sistema por habitante: 0.0000083 * 0.2. */
const SYSTEM_TAX_RATE = 0.0000083 * 0.2;
const BASE_GOLD_PER_LEVEL = 90;
const CAPITAL_GOLD_BONUS = 150;
const POPULATION_GOLD_FACTOR = 0.5;

export function calculateCityEconomy(city: City, world: World): CityEconomy {
  const tile = world.tiles.find((worldTile) => worldTile.x === city.x && worldTile.y === city.y);
  const provinceTiles = world.tiles.filter((worldTile) => worldTile.provinceId === city.provinceId);
  const terrain = tile?.terrain ?? "plain";
  const terrainDefense = terrainDefenseBonus(terrain);
  const capitalArmy = city.isCapital ? 220 : 0;
  const capitalDefense = city.isCapital ? 2 : 0;
  const maxPopulation = provinceTiles.length * MAX_DENSITY_PER_TILE;
  const overpopulationRatio = maxPopulation > 0
    ? Math.max(0, city.population - maxPopulation) / maxPopulation
    : 0;
  const productionMultiplier = 1 - overpopulationRatio;

  const monthlyGold = Math.round(
    city.population * POPULATION_GOLD_FACTOR
    + city.level * BASE_GOLD_PER_LEVEL
    + (city.isCapital ? CAPITAL_GOLD_BONUS : 0)
    + (city.level * city.population * SYSTEM_TAX_RATE * 1000000 * productionMultiplier)
  );
  const army = Math.round(
    (city.population * (city.isCapital ? 0.026 : 0.017) +
      city.level * 135 +
      capitalArmy) * productionMultiplier,
  );
  const defense = clampInt(
    Math.round(
      (city.level + terrainDefense + capitalDefense) *
        productionMultiplier,
    ),
    1,
    12,
  );

  const monthlyConsumption = {
    grain: Math.round(city.population * CONSUMPTION_PER_PERSON.grain * 1000) / 1000,
    water: Math.round(city.population * CONSUMPTION_PER_PERSON.water * 1000) / 1000,
  };

  return {
    army,
    defense,
    monthlyGold,
    overpopulationRatio,
    population: city.population,
    monthlyConsumption,
  };
}

export function calculateNationCityEconomy(nationId: string, world: World): NationCityEconomy {
  const cityEconomies = world.cities
    .filter((city) => city.nationId === nationId)
    .map((city) => calculateCityEconomy(city, world));

  return cityEconomies.reduce<NationCityEconomy>(
    (total, economy) => ({
      army: total.army + economy.army,
      maxDefense: Math.max(total.maxDefense, economy.defense),
      monthlyGold: total.monthlyGold + economy.monthlyGold,
      population: total.population + economy.population,
      monthlyConsumption: {
        grain: total.monthlyConsumption.grain + economy.monthlyConsumption.grain,
        water: total.monthlyConsumption.water + economy.monthlyConsumption.water,
      },
    }),
    { army: 0, maxDefense: 0, monthlyGold: 0, population: 0, monthlyConsumption: { grain: 0, water: 0 } },
  );
}

function terrainGoldBonus(terrain: Terrain) {
  switch (terrain) {
    case "coast":
      return 10;
    case "plain":
      return 8;
    case "forest":
      return 5;
    case "hill":
      return 3;
    case "desert":
      return -2;
    case "mountain":
      return -4;
    case "ocean":
      return 0;
  }
}

function terrainDefenseBonus(terrain: Terrain) {
  switch (terrain) {
    case "mountain":
      return 4;
    case "hill":
      return 3;
    case "forest":
      return 2;
    case "desert":
      return 1;
    case "coast":
      return 1;
    case "plain":
      return 0;
    case "ocean":
      return 0;
  }
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
