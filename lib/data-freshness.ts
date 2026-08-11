import type { StockInput } from "./valuation.ts";

const STALE_FINANCIAL_DAYS = 45;
const DAY_MS = 86_400_000;

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

