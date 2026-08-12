import { getRuntimeDatabase } from "./runtime-env.ts";
import type { StockInput } from "./valuation.ts";

export type TaiwanAnnualFinancial = {
  ticker: string;
  fiscalYear: number;
  periodEnd: string;
  eps?: number;
  revenue?: number;
  operatingCashFlow?: number;
  capitalExpenditure?: number;
  assets?: number;
  liabilities?: number;
  equity?: number;
  shares?: number;
  netIncome?: number;
  ebit?: number;
  cashAndInvestments?: number;
  totalDebt?: number;
  taxProvision?: number;
  pretaxIncome?: number;
  updatedAt: string;
};

type YahooPoint = {
  asOfDate?: string;
  reportedValue?: { raw?: number };
};

type YahooSeries = {
  meta?: { type?: string[] };
  [key: string]: unknown;
};

export type YahooFinancialTimeseries = {
  timeseries?: { result?: YahooSeries[] };
};

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS taiwan_financial_history (
  ticker TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  period_end TEXT NOT NULL,
  eps REAL,
  revenue REAL,
  operating_cash_flow REAL,
  capital_expenditure REAL,
  assets REAL,
  liabilities REAL,
  equity REAL,
  shares REAL,
  net_income REAL,
  ebit REAL,
  cash_and_investments REAL,
  total_debt REAL,
  tax_provision REAL,
  pretax_income REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ticker, fiscal_year)
)`;

const SERIES_FIELDS = {
  annualDilutedEPS: { field: "eps", priority: 2 },
  annualBasicEPS: { field: "eps", priority: 1 },
  annualTotalRevenue: { field: "revenue", priority: 1 },
  annualOperatingCashFlow: { field: "operatingCashFlow", priority: 1 },
  annualCapitalExpenditure: { field: "capitalExpenditure", priority: 1 },
  annualTotalAssets: { field: "assets", priority: 1 },
  annualTotalLiabilitiesNetMinorityInterest: { field: "liabilities", priority: 1 },
  annualStockholdersEquity: { field: "equity", priority: 1 },
  annualDilutedAverageShares: { field: "shares", priority: 3 },
  annualBasicAverageShares: { field: "shares", priority: 2 },
  annualOrdinarySharesNumber: { field: "shares", priority: 1 },
  annualNetIncome: { field: "netIncome", priority: 1 },
  annualEBIT: { field: "ebit", priority: 2 },
  annualOperatingIncome: { field: "ebit", priority: 1 },
  annualCashCashEquivalentsAndShortTermInvestments: { field: "cashAndInvestments", priority: 1 },
  annualTotalDebt: { field: "totalDebt", priority: 1 },
  annualTaxProvision: { field: "taxProvision", priority: 1 },
  annualPretaxIncome: { field: "pretaxIncome", priority: 1 },
} as const;

const REQUESTED_SERIES = Object.keys(SERIES_FIELDS).join(",");

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseTaiwanFinancialTimeseries(
  ticker: string,
  payload: YahooFinancialTimeseries,
  updatedAt = new Date().toISOString(),
) {
  const byYear = new Map<number, TaiwanAnnualFinancial>();
  const priorities = new Map<string, number>();
  for (const series of payload.timeseries?.result ?? []) {
    const type = series.meta?.type?.[0] as keyof typeof SERIES_FIELDS | undefined;
    const config = type ? SERIES_FIELDS[type] : undefined;
    if (!type || !config) continue;
    const points = Array.isArray(series[type]) ? series[type] as YahooPoint[] : [];
    for (const point of points) {
      const periodEnd = String(point.asOfDate ?? "");
      const fiscalYear = Number(periodEnd.slice(0, 4));
      const value = finite(point.reportedValue?.raw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || !fiscalYear || value === undefined) continue;
      const row = byYear.get(fiscalYear) ?? { ticker, fiscalYear, periodEnd, updatedAt };
      const priorityKey = `${fiscalYear}:${config.field}`;
      if ((priorities.get(priorityKey) ?? 0) < config.priority) {
        Object.assign(row, { [config.field]: value });
        priorities.set(priorityKey, config.priority);
      }
      if (periodEnd > row.periodEnd) row.periodEnd = periodEnd;
      byYear.set(fiscalYear, row);
    }
  }
  return [...byYear.values()].sort((left, right) => left.fiscalYear - right.fiscalYear).slice(-5);
}

export function financialInputsFromTaiwanHistory(rows: TaiwanAnnualFinancial[]) {
  const history = [...rows].sort((left, right) => left.fiscalYear - right.fiscalYear);
  const latest = history.at(-1);
  const previous = history.at(-2);
  if (!latest) return null;
  const shares = finite(latest.shares);
  const perShare = (value?: number) => shares && shares > 0 && value !== undefined ? value / shares : undefined;
  const revenueGrowth = latest.revenue && previous?.revenue && previous.revenue !== 0
    ? (latest.revenue / previous.revenue - 1) * 100
    : undefined;
  const fcf = latest.operatingCashFlow !== undefined && latest.capitalExpenditure !== undefined
    ? latest.operatingCashFlow - Math.abs(latest.capitalExpenditure)
    : undefined;
  const debtRatio = latest.assets && latest.liabilities !== undefined
    ? (latest.liabilities / Math.abs(latest.assets)) * 100
    : undefined;
  const result: Partial<StockInput> = {
    epsHistory: history.flatMap((row) => row.eps !== undefined
      ? [{ value: row.eps, end: row.periodEnd, basis: "annual" as const }]
      : []),
    financialDataDate: latest.periodEnd,
    dataBasis: "annual",
  };
  if (revenueGrowth !== undefined) result.revenueGrowth = revenueGrowth;
  const fcfPerShare = perShare(fcf);
  if (fcfPerShare !== undefined) result.fcfPerShare = fcfPerShare;
  if (debtRatio !== undefined) result.debtRatio = debtRatio;
  const revenuePerShare = perShare(latest.revenue);
  if (revenuePerShare !== undefined) result.revenuePerShare = revenuePerShare;
  const ebitPerShare = perShare(latest.ebit);
  if (ebitPerShare !== undefined) result.ebitPerShare = ebitPerShare;
  const cashPerShare = perShare(latest.cashAndInvestments);
  if (cashPerShare !== undefined) result.cashPerShare = cashPerShare;
  const debtPerShare = perShare(latest.totalDebt);
  if (debtPerShare !== undefined) result.debtPerShare = debtPerShare;
  if (latest.netIncome !== undefined && latest.revenue) result.netMargin = latest.netIncome / latest.revenue * 100;
  if (latest.revenue !== undefined && latest.assets) result.assetTurnover = latest.revenue / Math.abs(latest.assets);
  if (latest.assets !== undefined && latest.equity) result.financialLeverage = Math.abs(latest.assets / latest.equity);
  if (latest.taxProvision !== undefined && latest.pretaxIncome) {
    result.taxRate = Math.min(Math.abs(latest.taxProvision / latest.pretaxIncome), 0.35);
  }
  return result;
}

function databaseOrUndefined(database?: D1Database) {
  return database ?? getRuntimeDatabase();
}

export async function readTaiwanFinancialHistory(ticker: string, database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db) return [] as TaiwanAnnualFinancial[];
  try {
    await db.prepare(CREATE_TABLE).run();
    const result = await db.prepare(
      `SELECT ticker, fiscal_year AS fiscalYear, period_end AS periodEnd, eps, revenue,
        operating_cash_flow AS operatingCashFlow, capital_expenditure AS capitalExpenditure,
        assets, liabilities, equity, shares, net_income AS netIncome, ebit,
        cash_and_investments AS cashAndInvestments, total_debt AS totalDebt,
        tax_provision AS taxProvision, pretax_income AS pretaxIncome, updated_at AS updatedAt
       FROM taiwan_financial_history WHERE ticker = ? ORDER BY fiscal_year`,
    ).bind(ticker).all<TaiwanAnnualFinancial>();
    return result.results ?? [];
  } catch {
    return [] as TaiwanAnnualFinancial[];
  }
}

export async function saveTaiwanFinancialHistory(rows: TaiwanAnnualFinancial[], database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db || !rows.length) return 0;
  try {
    await db.prepare(CREATE_TABLE).run();
    await db.batch(rows.map((row) => db.prepare(
      `INSERT INTO taiwan_financial_history
        (ticker, fiscal_year, period_end, eps, revenue, operating_cash_flow, capital_expenditure,
         assets, liabilities, equity, shares, net_income, ebit, cash_and_investments,
         total_debt, tax_provision, pretax_income, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker, fiscal_year) DO UPDATE SET
         period_end = excluded.period_end, eps = excluded.eps, revenue = excluded.revenue,
         operating_cash_flow = excluded.operating_cash_flow, capital_expenditure = excluded.capital_expenditure,
         assets = excluded.assets, liabilities = excluded.liabilities, equity = excluded.equity,
         shares = excluded.shares, net_income = excluded.net_income, ebit = excluded.ebit,
         cash_and_investments = excluded.cash_and_investments, total_debt = excluded.total_debt,
         tax_provision = excluded.tax_provision, pretax_income = excluded.pretax_income,
         updated_at = excluded.updated_at`,
    ).bind(
      row.ticker, row.fiscalYear, row.periodEnd, row.eps ?? null, row.revenue ?? null,
      row.operatingCashFlow ?? null, row.capitalExpenditure ?? null, row.assets ?? null,
      row.liabilities ?? null, row.equity ?? null, row.shares ?? null, row.netIncome ?? null,
      row.ebit ?? null, row.cashAndInvestments ?? null, row.totalDebt ?? null,
      row.taxProvision ?? null, row.pretaxIncome ?? null, row.updatedAt,
    )));
    return rows.length;
  } catch {
    return 0;
  }
}

async function fetchYahooHistory(symbol: string, fetcher: typeof fetch, now: Date) {
  const period1 = Math.floor(new Date(Date.UTC(now.getUTCFullYear() - 7, 0, 1)).getTime() / 1_000);
  const period2 = Math.floor(now.getTime() / 1_000) + 86_400;
  const response = await fetcher(
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${REQUESTED_SERIES}&period1=${period1}&period2=${period2}`,
    {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)" },
      next: { revalidate: 60 * 60 * 12 },
      signal: AbortSignal.timeout(3_500),
    },
  );
  if (!response.ok) return [];
  return parseTaiwanFinancialTimeseries(symbol.replace(/\.(TW|TWO)$/i, ""), await response.json() as YahooFinancialTimeseries, now.toISOString());
}

export async function loadTaiwanFinancialHistory(
  ticker: string,
  options: { fetcher?: typeof fetch; now?: Date; database?: D1Database } = {},
) {
  const now = options.now ?? new Date();
  const stored = await readTaiwanFinancialHistory(ticker, options.database);
  const storedAt = Math.max(...stored.map((row) => Date.parse(row.updatedAt)).filter(Number.isFinite), 0);
  if (stored.length >= 3 && now.getTime() - storedAt < 24 * 60 * 60 * 1_000) return stored;

  const results = await Promise.allSettled([
    fetchYahooHistory(`${ticker}.TW`, options.fetcher ?? fetch, now),
    fetchYahooHistory(`${ticker}.TWO`, options.fetcher ?? fetch, now),
  ]);
  const fetched = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
    .sort((left, right) => right.length - left.length)[0] ?? [];
  if (fetched.length >= 2) {
    await saveTaiwanFinancialHistory(fetched, options.database);
    return fetched;
  }
  return stored;
}
