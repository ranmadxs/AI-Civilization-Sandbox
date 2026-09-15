import type { World } from "./types";

export type NationalCurrency = {
  nationId: string;
  metalReserve: Record<string, number>;
  exchangeRateToGold: number;
  conversionFee: number;
};

export type CurrencyState = {
  goldUniversal: number;
  nationalCurrencies: Record<string, NationalCurrency>;
};

const CONVERSION_FEE_RATE = 0.02;

export function buildInitialCurrencyState(world: World): CurrencyState {
  const nationalCurrencies: Record<string, NationalCurrency> = {};

  for (const nation of world.nations) {
    const metalReserve: Record<string, number> = {};
    for (const resource of ["iron", "coal", "copper", "silver", "gold"]) {
      metalReserve[resource] = Math.round(Math.random() * 500 + 100);
    }
    const totalMetal = Object.values(metalReserve).reduce((a, b) => a + b, 0);
    const population = world.cities
      .filter((c) => c.nationId === nation.id)
      .reduce((s, c) => s + c.population, 0);
    const factor = 0.01;
    const exchangeRate = population > 0 ? (totalMetal / population) * factor : 0.01;

    nationalCurrencies[nation.id] = {
      nationId: nation.id,
      metalReserve,
      exchangeRateToGold: Math.max(0.001, exchangeRate),
      conversionFee: CONVERSION_FEE_RATE,
    };
  }

  return {
    goldUniversal: 1,
    nationalCurrencies,
  };
}

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  currencyState: CurrencyState,
): number {
  if (fromCurrency === "gold" && toCurrency === "gold") {
    return amount;
  }
  if (fromCurrency === "gold") {
    return amount;
  }
  if (toCurrency === "gold") {
    return amount;
  }

  const from = currencyState.nationalCurrencies[fromCurrency];
  const to = currencyState.nationalCurrencies[toCurrency];
  if (!from || !to) {
    return amount;
  }

  const goldValue = amount * from.exchangeRateToGold;
  const fee = goldValue * CONVERSION_FEE_RATE;
  const toAmount = (goldValue - fee) / to.exchangeRateToGold;
  return Math.max(0, toAmount);
}

export function getNationalCurrencyValue(nationId: string, currencyState: CurrencyState): number {
  const currency = currencyState.nationalCurrencies[nationId];
  return currency ? currency.exchangeRateToGold : 1;
}
