/** CI-only shape observations; never repairs a quote or emits prices/raw strings. */
export const RAW_QUOTE_TAIL_LIMIT = 3;
const fields = ['open', 'high', 'low', 'close'] as const;
const kinds = ['missing', 'undefined', 'null', 'finite-number', 'nan', 'positive-infinity',
  'negative-infinity', 'string', 'boolean', 'array', 'object', 'other'] as const;
type Kind = typeof kinds[number];
type Shape = { kind: Kind; length: number | null };
const outcomes = ['missing-parser-container', 'skips-sparse-timestamp-index', 'reject-nonfinite-ohlc', 'reject-high-below-low',
  'throws-invalid-timestamp', 'emits-row-before-session-validation'] as const;
const orders = ['first-row', 'increasing-date', 'duplicate-date', 'decreasing-date', 'uncomparable'] as const;
type TailRow = { index: number; timestampKind: Kind; parserUtcDate: string | null;
  dateOrderVsPreviousRawRow: typeof orders[number]; ohlcKinds: Record<typeof fields[number], Kind>;
  parserRowOutcome: typeof outcomes[number]; highBelowLow: boolean | null;
  nonpositiveOhlc: boolean | null; outsideHighLowEnvelope: boolean | null };
export type RawQuoteTailDiagnostics = { version: 1; timestamp: Shape; quote: Shape;
  columns: Record<typeof fields[number], Shape>; rows: TailRow[] };
const own = (value: unknown, key: PropertyKey) => value != null && Object.hasOwn(Object(value), key);
function kind(value: unknown, present = true): Kind {
  if (!present) return 'missing';
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isNaN(value) ? 'nan' : value === Infinity
    ? 'positive-infinity' : value === -Infinity ? 'negative-infinity' : 'finite-number';
  if (Array.isArray(value)) return 'array';
  return ['string', 'boolean', 'object'].includes(typeof value) ? typeof value as Kind : 'other';
}
const shape = (value: unknown, present: boolean): Shape => ({ kind: kind(value, present),
  length: Array.isArray(value) ? value.length : null });
function parserDate(value: unknown): string | null {
  try {
    const date = new Date((value as number) * 1000);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  } catch { return null; }
}

export function observeRawQuoteTail(payload: any): RawQuoteTailDiagnostics {
  const result = payload?.chart?.result?.[0], timestamp = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  const rows: TailRow[] = [];
  if (Array.isArray(timestamp)) for (let index = Math.max(0, timestamp.length - RAW_QUOTE_TAIL_LIMIT); index < timestamp.length; index++) {
    const values = fields.map(field => quote?.[field]?.[index]);
    const finite = values.every(value => typeof value === 'number' && Number.isFinite(value));
    const [open, high, low, close] = values;
    const date = parserDate(timestamp[index]), previous = index ? parserDate(timestamp[index - 1]) : null;
    const highBelowLow = finite ? high < low : null;
    rows.push({ index, timestampKind: kind(timestamp[index], own(timestamp, index)), parserUtcDate: date,
      dateOrderVsPreviousRawRow: index === 0 ? 'first-row' : !date || !previous ? 'uncomparable'
        : date === previous ? 'duplicate-date' : date > previous ? 'increasing-date' : 'decreasing-date',
      ohlcKinds: Object.fromEntries(fields.map((field, i) => [field, kind(values[i], own(quote?.[field], index))])) as TailRow['ohlcKinds'],
      parserRowOutcome: !quote ? 'missing-parser-container' : !own(timestamp, index) ? 'skips-sparse-timestamp-index' : !finite ? 'reject-nonfinite-ohlc'
        : highBelowLow ? 'reject-high-below-low' : !date ? 'throws-invalid-timestamp' : 'emits-row-before-session-validation',
      highBelowLow, nonpositiveOhlc: finite ? Math.min(open, high, low, close) <= 0 : null,
      outsideHighLowEnvelope: finite ? high < Math.max(open, close, low) || low > Math.min(open, close) : null });
  }
  return { version: 1, timestamp: shape(timestamp, own(result, 'timestamp')), quote: shape(quote, own(result?.indicators?.quote, 0)),
    columns: Object.fromEntries(fields.map(field => [field, shape(quote?.[field], own(quote, field))])) as RawQuoteTailDiagnostics['columns'], rows };
}

/** Allowlist again at the log boundary; discard injected properties/strings. */
export function safeRawQuoteTail(value: any): RawQuoteTailDiagnostics | null {
  if (!value || value.version !== 1 || !Array.isArray(value.rows)) return null;
  const safeKind = (v: unknown): Kind => kinds.includes(v as Kind) ? v as Kind : 'other';
  const safeShape = (v: any): Shape => ({ kind: safeKind(v?.kind), length: v?.kind === 'array'
    && Number.isSafeInteger(v?.length) && v.length >= 0 ? v.length : null });
  const nullableBool = (v: unknown) => typeof v === 'boolean' ? v : null;
  const rows = value.rows.slice(-RAW_QUOTE_TAIL_LIMIT).filter((v: any) => Number.isSafeInteger(v?.index) && v.index >= 0).map((v: any): TailRow => ({
    index: v.index, timestampKind: safeKind(v.timestampKind),
    parserUtcDate: typeof v.parserUtcDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.parserUtcDate) ? v.parserUtcDate : null,
    dateOrderVsPreviousRawRow: orders.includes(v.dateOrderVsPreviousRawRow) ? v.dateOrderVsPreviousRawRow : 'uncomparable',
    ohlcKinds: Object.fromEntries(fields.map(field => [field, safeKind(v.ohlcKinds?.[field])])) as TailRow['ohlcKinds'],
    parserRowOutcome: outcomes.includes(v.parserRowOutcome) ? v.parserRowOutcome : 'missing-parser-container',
    highBelowLow: nullableBool(v.highBelowLow), nonpositiveOhlc: nullableBool(v.nonpositiveOhlc), outsideHighLowEnvelope: nullableBool(v.outsideHighLowEnvelope),
  }));
  return { version: 1, timestamp: safeShape(value.timestamp), quote: safeShape(value.quote),
    columns: Object.fromEntries(fields.map(field => [field, safeShape(value.columns?.[field])])) as RawQuoteTailDiagnostics['columns'], rows };
}
