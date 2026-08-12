import {
  ensureSnapshotSchema,
  saveFinancialSnapshots,
  saveMarketPriceSnapshots,
  saveSnapshotRun,
  type FinancialSnapshot,
  type MarketPriceSnapshot,
} from "./snapshot-store.ts";

export const DAILY_PRICE_CRON = "15 1 * * *";
export const QUARTERLY_FINANCIAL_CRON = "30 3 15 1,4,7,10 *";

export type SnapshotJobKind = "daily-price" | "quarterly-financial";
export type SnapshotValuation = {
  ticker: string;
  market: "TW" | "US";
  financialDataDate?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

type NasdaqRow = {
  symbol?: string;
  name?: string;
  lastsale?: string;
  marketCap?: string | number;
  volume?: string | number;
};

type TwseRow = { Code?: string; Name?: string; ClosingPrice?: string; TradeVolume?: string; Date?: string };
type TpexRow = { SecuritiesCompanyCode?: string; CompanyName?: string; Close?: string; TradingShares?: string; Date?: string };

export type SnapshotJobOptions = {
  database?: D1Database;
  fetcher?: typeof fetch;
  now?: Date;
  valuations?: SnapshotValuation[];
  invokeValuation?: (ticker: string, market: "TW" | "US") => Promise<SnapshotValuation | null>;
};

const SECURE_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)",
};

const NASDAQ_HEADERS = {
  ...SECURE_HEADERS,
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
};

const FINANCIAL_TICKERS: Array<[string, "TW" | "US"]> = [
  ["AAPL", "US"], ["GDDY", "US"], ["MU", "US"], ["NVDA", "US"], ["AMD", "US"],
  ["TSM", "US"], ["AMAT", "US"], ["INTC", "US"], ["CSCO", "US"], ["PANW", "US"],
  ["MSFT", "US"], ["AMZN", "US"], ["META", "US"], ["AVGO", "US"], ["GOOGL", "US"],
  ["TSLA", "US"], ["2330", "TW"], ["2454", "TW"], ["2317", "TW"], ["2382", "TW"],
];

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replaceAll(",", "").replace(/[$%]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function getJson<T>(url: string, fetcher: typeof fetch, headers = SECURE_HEADERS) {
  const response = await fetcher(url, { headers });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json() as Promise<T>;
}

function parseNasdaqRows(payload: { data?: { rows?: NasdaqRow[] } } | undefined, updatedAt: string) {
  return (payload?.data?.rows ?? []).flatMap((row): MarketPriceSnapshot[] => {
    const ticker = String(row.symbol ?? "").trim().toUpperCase();
    const price = numberValue(row.lastsale);
    if (!ticker || !price || price <= 0) return [];
    return [{
      market: "US",
      ticker,
      name: String(row.name ?? ticker),
      price,
      marketCap: numberValue(row.marketCap),
      volume: numberValue(row.volume),
      priceDate: updatedAt.slice(0, 10),
      updatedAt,
    }];
  });
}

function parseTwseRows(rows: TwseRow[], updatedAt: string) {
  return rows.flatMap((row): MarketPriceSnapshot[] => {
    const ticker = String(row.Code ?? "").trim();
    const price = numberValue(row.ClosingPrice);
    if (!/^\d{4}$/.test(ticker) || !price || price <= 0) return [];
    return [{
      market: "TW",
      ticker,
      name: String(row.Name ?? ticker),
      price,
      volume: numberValue(row.TradeVolume),
      priceDate: row.Date ?? updatedAt.slice(0, 10),
      updatedAt,
    }];
  });
}

function parseTpexRows(rows: TpexRow[], updatedAt: string) {
  return rows.flatMap((row): MarketPriceSnapshot[] => {
    const ticker = String(row.SecuritiesCompanyCode ?? "").trim();
    const price = numberValue(row.Close);
    if (!/^\d{4}$/.test(ticker) || !price || price <= 0) return [];
    return [{
      market: "TW",
      ticker,
      name: String(row.CompanyName ?? ticker),
      price,
      volume: numberValue(row.TradingShares),
      priceDate: row.Date ?? updatedAt.slice(0, 10),
      updatedAt,
    }];
  });
}

async function refreshPrices(fetcher: typeof fetch, now: Date) {
  const updatedAt = now.toISOString();
  const results = await Promise.allSettled([
    getJson<TwseRow[]>("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", fetcher),
    getJson<TpexRow[]>("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes", fetcher),
    getJson<{ data?: { rows?: NasdaqRow[] } }>("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true", fetcher, NASDAQ_HEADERS),
  ]);
  const [twse, tpex, nasdaq] = results;
  const rows = [
    ...(twse.status === "fulfilled" ? parseTwseRows(twse.value, updatedAt) : []),
    ...(tpex.status === "fulfilled" ? parseTpexRows(tpex.value, updatedAt) : []),
    ...(nasdaq.status === "fulfilled" ? parseNasdaqRows(nasdaq.value, updatedAt) : []),
  ];
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason instanceof Error ? result.reason.message : "price source unavailable");
  if (rows.length === 0) throw new Error(errors.join("; ") || "all price sources returned no rows");
  return { rows, errors };
}

async function refreshFinancials(options: SnapshotJobOptions) {
  if (options.valuations) return options.valuations;
  if (!options.invokeValuation) return [];
  const rows: SnapshotValuation[] = [];
  for (let start = 0; start < FINANCIAL_TICKERS.length; start += 4) {
    const chunk = FINANCIAL_TICKERS.slice(start, start + 4);
    const results = await Promise.all(chunk.map(async ([ticker, market]) => {
      try {
        return await options.invokeValuation?.(ticker, market) ?? null;
      } catch {
        return null;
      }
    }));
    rows.push(...results.filter((row): row is SnapshotValuation => Boolean(row)));
  }
  return rows;
}

export async function runSnapshotJob(kind: SnapshotJobKind, options: SnapshotJobOptions = {}) {
  const database = options.database;
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  await ensureSnapshotSchema(database);
  try {
    const priceResult = kind === "daily-price"
      ? await refreshPrices(options.fetcher ?? fetch, now)
      : { rows: [] as MarketPriceSnapshot[], errors: [] as string[] };
    const valuations = kind === "quarterly-financial" ? await refreshFinancials(options) : [];
    const financialRows: FinancialSnapshot[] = valuations.map((stock) => ({
      market: stock.market,
      ticker: stock.ticker,
      payload: JSON.stringify(stock),
      financialDataDate: stock.financialDataDate,
      updatedAt: stock.updatedAt ?? now.toISOString(),
    }));
    const savedPrices = await saveMarketPriceSnapshots(priceResult.rows, database);
    const savedFinancials = await saveFinancialSnapshots(financialRows, database);
    const finishedAt = new Date().toISOString();
    const status = priceResult.errors.length > 0 ? "partial" : "succeeded";
    await saveSnapshotRun({
      kind,
      status,
      startedAt,
      finishedAt,
      priceCount: savedPrices,
      financialCount: savedFinancials,
      error: priceResult.errors.join("; ") || undefined,
    }, database);
    return { kind, status: status as "partial" | "succeeded", priceCount: savedPrices, financialCount: savedFinancials };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    await saveSnapshotRun({
      kind,
      status: "failed",
      startedAt,
      finishedAt,
      priceCount: 0,
      financialCount: 0,
      error: error instanceof Error ? error.message : "snapshot refresh failed",
    }, database);
    return { kind, status: "failed" as const, priceCount: 0, financialCount: 0 };
  }
}

export function snapshotKindForCron(cron: string): SnapshotJobKind {
  return cron === QUARTERLY_FINANCIAL_CRON ? "quarterly-financial" : "daily-price";
}
