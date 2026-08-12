export type DailyCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type YahooChartPayload = {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; exchangeName?: string };
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

export function yahooHistorySymbols(ticker: string, market: "TW" | "US") {
  const normalized = ticker.trim().toUpperCase().replace(/\.(TW|TWO)$/, "");
  return market === "TW" ? [`${normalized}.TW`, `${normalized}.TWO`] : [normalized];
}

