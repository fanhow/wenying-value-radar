import type { EarningsHistoryPoint, StockInput } from './valuation.ts';
import { isFinancialCompany } from './company-classification.ts';

const DAY = 86400000;
const validDate = (value: string | undefined): value is string => Boolean(value
  && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value);

/** Taiwan calendar-year EPS evidence; no duplicate, shifted or stale years. */
export function taiwanAnnualEarnings(history: EarningsHistoryPoint[] | undefined, financialEnd: string | undefined) {
  if (!validDate(financialEnd)) return [];
  const unique = new Map<string, EarningsHistoryPoint>();
  const conflicts = new Set<string>();
  for (const point of history ?? []) {
    if (point.basis !== 'annual' || !validDate(point.end) || !point.end.endsWith('-12-31')
      || point.end > financialEnd || (Date.parse(financialEnd) - Date.parse(point.end)) / DAY > 6 * 366
      || !Number.isFinite(point.value) || conflicts.has(point.end)) continue;
    const previous = unique.get(point.end);
    if (previous && previous.value !== point.value) {
      unique.delete(point.end);
      conflicts.add(point.end);
    } else unique.set(point.end, point);
  }
  return [...unique.values()].sort((a, b) => b.end!.localeCompare(a.end!)).slice(0, 5);
}

export function taiwanEarningsOperationsDivergence(stock: StockInput) {
  return !isFinancialCompany(stock) && stock.eps > 0
    && Number.isFinite(stock.ebitPerShare) && stock.ebitPerShare! <= 0;
}

export function taiwanMaterialMinorityClaims(stock: StockInput) {
  return Number.isFinite(stock.financialMetrics?.nonControllingBookPerShare)
    && stock.financialMetrics!.nonControllingBookPerShare! > stock.bvps * 0.25;
}
