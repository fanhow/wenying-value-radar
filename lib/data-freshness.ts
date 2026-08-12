import type { StockInput } from "./valuation.ts";

const STALE_FINANCIAL_DAYS = 45;
const DAY_MS = 86_400_000;

export type FinancialFreshness = "fresh" | "aging" | "stale" | "unknown";

/**
 * Classifies the age of the financial statement period used by a valuation.
 * This is intentionally separate from the 45-day refresh rule above: a
 * quarter-end statement can be usable for a few months, while an annual-only
 * snapshot should become visibly stale rather than silently looking current.
 */
export function classifyFinancialFreshness(value: string | undefined, now = Date.now()): FinancialFreshness {
  if (!value) return "unknown";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "unknown";
  const ageDays = Math.max(0, Math.floor((now - parsed) / DAY_MS));
  if (ageDays <= 120) return "fresh";
  if (ageDays <= 240) return "aging";
  return "stale";
}

export function financialAgeDays(value: string | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((now - parsed) / DAY_MS));
}

function hasStaleDate(value: string | undefined, now: number) {
  if (!value) return true;
  const parsed = Date.parse(value);
  return !Number.isFinite(parsed) || now - parsed > STALE_FINANCIAL_DAYS * DAY_MS;
}

/**
 * Saved public-data valuations should refresh before they become the active
 * detail view. Manual entries and captured ARKER screenshots are intentional
 * user snapshots, so they remain local until the user explicitly refreshes.
 */
export function shouldRefreshSavedStock(stock: Pick<StockInput, "source" | "dataBasis" | "dataCompleteness" | "financialDataDate">, now = Date.now()) {
  if (stock.source === "手動輸入" || stock.source === "方舟截圖") return false;
  if (stock.dataBasis !== "ltm") return true;
  if (stock.dataCompleteness === "limited") return true;
  return hasStaleDate(stock.financialDataDate, now);
}
