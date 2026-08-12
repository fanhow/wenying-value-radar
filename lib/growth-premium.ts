import type { FundPortfolioPeSummary, InstitutionalSignal } from "./fund-signal.ts";
import type { MarketPricingAssessment, Stock } from "./valuation.ts";

export type GrowthPremiumTrigger = "theme" | "institutional" | "growth" | "market-multiple" | "price-premium";

export type GrowthPremiumAssessment = {
  enabled: boolean;
  triggerCount: number;
  triggers: GrowthPremiumTrigger[];
  marketPe: number | null;
  historicalPremium: number | null;
  impliedEpsAtFundMedianPe: number | null;
  requiredEpsGrowth: number | null;
  fundPortfolioPe?: FundPortfolioPeSummary;
  /** Raw fund-observation median, retained for transparency after de-duplication. */
  fundObservationMedianPe: number | null;
  marketPricing?: MarketPricingAssessment;
  marketFairValue: number | null;
  marketFairValueUpside: number | null;
};

function finitePositive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Determines whether a stock needs a second, forward-looking presentation layer.
 * It does not change the fair value; it explains when the market is pricing future
 * growth, optionality, or institutional conviction beyond current fundamentals.
 */
export function assessGrowthPremium(stock: Pick<Stock, "price" | "eps" | "fairValue" | "revenueGrowth" | "assumptions" | "institutionalSignal" | "fundPortfolioPe" | "marketPricing">): GrowthPremiumAssessment {
  const marketPe = finitePositive(stock.eps) > 0 && finitePositive(stock.price) > 0
    ? stock.price / stock.eps
    : null;
  const historicalPremium = finitePositive(stock.fairValue) > 0 && finitePositive(stock.price) > 0
    ? stock.price / stock.fairValue - 1
    : null;
  const institutional: InstitutionalSignal | undefined = stock.institutionalSignal;
  const triggers: GrowthPremiumTrigger[] = [];
  if (stock.assumptions.structuralThemes.length > 0) triggers.push("theme");
  if (institutional && (institutional.heldByCount >= 2 || institutional.increasedByCount > 0)) triggers.push("institutional");
  if (Number(stock.revenueGrowth) >= 8) triggers.push("growth");
  if (marketPe !== null && marketPe >= 35) triggers.push("market-multiple");
  if (historicalPremium !== null && historicalPremium >= 0.5) triggers.push("price-premium");

  const fundPortfolioPe = stock.fundPortfolioPe;
  // Repeated holdings across funds must not create a false centre estimate.
  // Use the unique-ticker median for the headline; keep the raw observation
  // median separately so the UI can show how much manager overlap matters.
  const fundMedianPe = fundPortfolioPe && finitePositive(fundPortfolioPe.uniqueMedianPe) > 0
    ? fundPortfolioPe.uniqueMedianPe
    : fundPortfolioPe && finitePositive(fundPortfolioPe.medianPe) > 0
      ? fundPortfolioPe.medianPe
    : 0;
  const impliedEpsAtFundMedianPe = fundMedianPe > 0 && finitePositive(stock.price) > 0
    ? stock.price / fundMedianPe
    : null;
  const currentEps = finitePositive(stock.eps);
  const requiredEpsGrowth = impliedEpsAtFundMedianPe !== null && currentEps > 0
    ? impliedEpsAtFundMedianPe / currentEps - 1
    : null;
  const marketPricing = stock.marketPricing;
  const marketFairValue = marketPricing?.fairValue ?? null;
  const marketFairValueUpside = marketFairValue !== null && finitePositive(stock.price) > 0
    ? marketFairValue / stock.price - 1
    : null;

  return {
    enabled: marketPricing?.enabled ?? triggers.length >= 2,
    triggerCount: triggers.length,
    triggers,
    marketPe,
    historicalPremium,
    impliedEpsAtFundMedianPe,
    requiredEpsGrowth,
    fundPortfolioPe,
    fundObservationMedianPe: fundPortfolioPe?.medianPe ?? null,
    marketPricing,
    marketFairValue,
    marketFairValueUpside,
  };
}
