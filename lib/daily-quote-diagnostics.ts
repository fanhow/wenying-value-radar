import type { DailyCandle, YahooChartPayload } from './price-history.ts';

export type QuoteDiagnosticFailureReason =
  | 'NO_VALID_COMPLETED_CANDLES'
  | 'INSUFFICIENT_COMPLETED_HISTORY'
  | 'LATEST_COMPLETED_SESSION_MISMATCH'
  | 'INVALID_CAUSAL_HISTORY'
  | 'QUOTE_CURRENCY_UNSUPPORTED'
  | 'QUOTE_PARSE_FAILED';

/** Bounded metadata only: no prices, financial values, response bodies or headers. */
export type QuoteDiagnostics = {
  expectedSessionDate: string;
  observedQuoteDate: string | null;
  rawLatestTimestamp: number | null;
  rawLatestDate: string | null;
  parsedLatestDate: string | null;
  rawBarCount: number;
  // null means the original parser did not complete, rather than zero valid bars.
  parsedBarCount: number | null;
  completedBarCount: number | null;
  minimumBars: 60;
  missingOhlcByField: { open: number; high: number; low: number; close: number };
  invalidOhlcRangeCount: number;
  expectedSessionRawBars: number;
  expectedSessionIncompleteOhlcBars: number;
  invalidTimestampCount: number;
  failureReason: QuoteDiagnosticFailureReason | null;
};

const OHLC_FIELDS = ['open', 'high', 'low', 'close'] as const;
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function timestampDate(value: unknown): string | null {
  if (!finite(value)) return null;
  const date = new Date(value * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

/**
 * Observe raw rows plus the collector's unchanged parsed/completed results.
 * Raw dates use the same UTC date convention as parseYahooDailyCandles. This
 * function never filters, repairs or accepts data for the collector.
 */
export function summarizeQuoteDiagnostics(
  payload: YahooChartPayload,
  expectedSessionDate: string,
  parsedCandles?: DailyCandle[],
  completedCandles?: DailyCandle[],
): QuoteDiagnostics {
  const result = payload?.chart?.result?.[0];
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0];
  const rawLatest = timestamps.at(-1);
  const summary: QuoteDiagnostics = {
    expectedSessionDate,
    observedQuoteDate: completedCandles?.at(-1)?.date ?? null,
    rawLatestTimestamp: finite(rawLatest) ? rawLatest : null,
    rawLatestDate: timestampDate(rawLatest),
    parsedLatestDate: parsedCandles?.at(-1)?.date ?? null,
    rawBarCount: timestamps.length,
    parsedBarCount: parsedCandles?.length ?? null,
    completedBarCount: completedCandles?.length ?? null,
    minimumBars: 60,
    missingOhlcByField: { open: 0, high: 0, low: 0, close: 0 },
    invalidOhlcRangeCount: 0,
    expectedSessionRawBars: 0,
    expectedSessionIncompleteOhlcBars: 0,
    invalidTimestampCount: 0,
    failureReason: null,
  };
  for (let index = 0; index < timestamps.length; index++) {
    const date = timestampDate(timestamps[index]);
    if (date === null) summary.invalidTimestampCount++;
    const values = OHLC_FIELDS.map(field => quote?.[field]?.[index]);
    let incomplete = false;
    for (let fieldIndex = 0; fieldIndex < OHLC_FIELDS.length; fieldIndex++) {
      if (!finite(values[fieldIndex])) {
        summary.missingOhlcByField[OHLC_FIELDS[fieldIndex]]++;
        incomplete = true;
      }
    }
    if (date === expectedSessionDate) {
      summary.expectedSessionRawBars++;
      if (incomplete) summary.expectedSessionIncompleteOhlcBars++;
    }
    if (!incomplete) {
      const [open, high, low, close] = values as number[];
      if (Math.min(open, high, low, close) <= 0
        || high < Math.max(open, close, low) || low > Math.min(open, close)) {
        summary.invalidOhlcRangeCount++;
      }
    }
  }
  return summary;
}
