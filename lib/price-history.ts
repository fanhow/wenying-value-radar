export type DailyCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type YahooChartPayload = {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; exchangeName?: string; fullExchangeName?: string };
      events?: {
        splits?: Record<string, {
          date?: number;
          numerator?: number;
          denominator?: number;
          splitRatio?: string;
        }>;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{
        open?: Array<number | null>;
        high?: Array<number | null>;
        low?: Array<number | null>;
        close?: Array<number | null>;
        volume?: Array<number | null>;
      }> };
    }>;
  };
};

export type CorporateAction = {
  date: string;
  type: "stock-distribution" | "capital-adjustment";
  ratio: number;
  rawRatio: string;
};

export type LatestMarketQuote = {
  date: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  limitUpPrice: number | null;
  isLimitUp: boolean;
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseYahooDailyCandles(payload: YahooChartPayload, limit = 120) {
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote) return [];

  return result.timestamp.flatMap((timestamp, index): DailyCandle[] => {
    const open = finite(quote.open?.[index]);
    const high = finite(quote.high?.[index]);
    const low = finite(quote.low?.[index]);
    const close = finite(quote.close?.[index]);
    if (open === null || high === null || low === null || close === null || high < low) return [];
    return [{
      date: new Date(timestamp * 1_000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: Math.max(finite(quote.volume?.[index]) ?? 0, 0),
    }];
  }).slice(-limit);
}

export function taiwanStockTickSize(price: number) {
  if (price < 10) return 0.01;
  if (price < 50) return 0.05;
  if (price < 100) return 0.1;
  if (price < 500) return 0.5;
  if (price < 1_000) return 1;
  return 5;
}

export function taiwanLimitUpPrice(referencePrice: number) {
  if (!(referencePrice > 0)) return null;
  const rawLimit = referencePrice * 1.1;
  const tick = taiwanStockTickSize(rawLimit);
  const decimals = tick < 0.1 ? 2 : tick < 1 ? 1 : 0;
  return Number((Math.floor((rawLimit + 1e-8) / tick) * tick).toFixed(decimals));
}

export function latestMarketQuoteFromCandles(candles: DailyCandle[], market: "TW" | "US"): LatestMarketQuote | null {
  if (candles.length < 2) return null;
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  if (!(latest.close > 0) || !(previous.close > 0)) return null;
  const change = latest.close - previous.close;
  const changePercent = change / previous.close;
  const limitUpPrice = market === "TW" ? taiwanLimitUpPrice(previous.close) : null;
  const tick = market === "TW" ? taiwanStockTickSize(latest.close) : 0;
  return {
    date: latest.date,
    price: latest.close,
    previousClose: previous.close,
    change,
    changePercent,
    limitUpPrice,
    isLimitUp: limitUpPrice !== null && Math.abs(latest.close - limitUpPrice) <= tick / 2 + 1e-8,
  };
}

export function parseYahooCorporateActions(payload: YahooChartPayload, now = new Date()) {
  const splits = Object.values(payload.chart?.result?.[0]?.events?.splits ?? {});
  const latestAllowed = now.getTime() + 24 * 60 * 60 * 1_000;
  return splits.flatMap((event): CorporateAction[] => {
    const numerator = finite(event.numerator);
    const denominator = finite(event.denominator);
    const timestamp = finite(event.date);
    if (numerator === null || denominator === null || denominator <= 0 || timestamp === null) return [];
    const eventTime = timestamp * 1_000;
    const ratio = numerator / denominator;
    if (eventTime > latestAllowed || ratio <= 0 || Math.abs(ratio - 1) < 0.001) return [];
    return [{
      date: new Date(eventTime).toISOString().slice(0, 10),
      type: ratio > 1 ? "stock-distribution" : "capital-adjustment",
      ratio,
      rawRatio: event.splitRatio || `${numerator}:${denominator}`,
    }];
  }).sort((left, right) => right.date.localeCompare(left.date)).slice(0, 4);
}

export function yahooHistorySymbols(ticker: string, market: "TW" | "US") {
  const normalized = ticker.trim().toUpperCase().replace(/\.(TW|TWO)$/, "");
  return market === "TW" ? [`${normalized}.TW`, `${normalized}.TWO`] : [normalized];
}

const TRADING_VIEW_EXCHANGES: Record<string, string> = {
  NMS: "NASDAQ",
  NGM: "NASDAQ",
  NCM: "NASDAQ",
  NAS: "NASDAQ",
  NYQ: "NYSE",
  NYS: "NYSE",
  ASE: "AMEX",
  PCX: "NYSEARCA",
  BTS: "CBOE",
  PNK: "OTC",
  OBB: "OTC",
  TAI: "TWSE",
  TWO: "TPEX",
};

export function tradingViewSymbolFromYahoo(payload: YahooChartPayload, fallbackSymbol: string) {
  const meta = payload.chart?.result?.[0]?.meta;
  const yahooSymbol = String(meta?.symbol || fallbackSymbol).trim().toUpperCase();
  const ticker = yahooSymbol.replace(/\.(TW|TWO)$/, "");
  const exchange = TRADING_VIEW_EXCHANGES[String(meta?.exchangeName ?? "").toUpperCase()]
    ?? (yahooSymbol.endsWith(".TWO") ? "TPEX" : yahooSymbol.endsWith(".TW") ? "TWSE" : "");
  return exchange && ticker ? `${exchange}:${ticker}` : null;
}
