import type { EarningsHistoryPoint, StockInput } from './valuation.ts';
import { isFinancialCompany } from './company-classification.ts';

const DAY = 86400000;
const validDate = (value: string | undefined): value is string => Boolean(value
  && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value);

/** Explicit, reviewed filing scope; a provider aggregate or missing item is not proof. */
export type TaiwanEnterpriseBridgeEvidence = {
  sourceType: 'issuer-filing';
  sourceUrl: string;
  publishedDate: string;
  periodEnd: string;
  currency: 'TWD';
  sharesOutstanding: number;
  cashAndInvestments: number;
  debtIncludingLeases: number;
  cashScope: 'unrestricted-cash-and-short-term-investments-excluding-factoring';
  debtScope: 'interest-bearing-with-current-and-noncurrent-leases';
};

export function validTaiwanEnterpriseBridgeEvidence(stock: StockInput) {
  const e=stock.financialMetrics?.enterpriseBridgeEvidence;
  const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
  const equal=(a:number,b:number)=>Math.abs(a-b)<=Math.max(1e-6,Math.abs(b)*1e-9);
  if(!e||stock.market!=='TW'||stock.dataBasis!=='ltm'||stock.financialMetrics?.currency!=='TWD'
    ||stock.financialMetrics.periodBasis!=='ltm'||stock.financialMetrics.shareBasis!=='period-end-ordinary'
    ||e.sourceType!=='issuer-filing'||e.currency!=='TWD'
    ||e.cashScope!=='unrestricted-cash-and-short-term-investments-excluding-factoring'
    ||e.debtScope!=='interest-bearing-with-current-and-noncurrent-leases'
    ||!validDate(e.periodEnd)||e.periodEnd!==stock.financialDataDate
    ||!validDate(e.publishedDate)||!validDate(stock.updatedAt)
    ||e.publishedDate<e.periodEnd||e.publishedDate>stock.updatedAt
    ||!finite(e.sharesOutstanding)||e.sharesOutstanding<=0
    ||e.sharesOutstanding!==stock.financialMetrics.sharesOutstanding
    ||!finite(e.cashAndInvestments)||e.cashAndInvestments<0
    ||!finite(e.debtIncludingLeases)||e.debtIncludingLeases<0
    ||!finite(stock.cashPerShare)||!finite(stock.debtPerShare)
    ||!equal(stock.cashPerShare*e.sharesOutstanding,e.cashAndInvestments)
    ||!equal(stock.debtPerShare*e.sharesOutstanding,e.debtIncludingLeases))return false;
  try {
    const url=new URL(e.sourceUrl);
    return url.protocol==='https:'&&!url.username&&!url.password;
  } catch {return false;}
}

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
