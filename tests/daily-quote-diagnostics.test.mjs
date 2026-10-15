import test from 'node:test';
import assert from 'node:assert/strict';
import { completedCandles, fetchRefreshRecord, validRefreshCandles } from '../lib/daily-refresh-data.ts';
import { parseYahooDailyCandles } from '../lib/price-history.ts';
import { summarizeQuoteDiagnostics } from '../lib/daily-quote-diagnostics.ts';

// Synthetic offline provider responses. These are not retrieved market data.
const expected = '2026-10-12';
const refreshTime = new Date('2026-10-13T03:06:40Z');
const targets = [
  { ticker: '1101', name: 'TWSE offline fixture', sector: 'Materials', market: 'TW', listingBoard: 'TWSE' },
  { ticker: '6488', name: 'TPEx offline fixture', sector: 'Technology', market: 'TW', listingBoard: 'TPEx' },
  { ticker: 'AAPL', name: 'US offline fixture', sector: 'Technology', market: 'US' },
];
function datesTo(end, count = 80, market = 'US') {
  const dates = [];
  for (let time = Date.parse(`${end}T00:00:00Z`); dates.length < count; time -= 86400000) {
    const day = new Date(time);
    const date = day.toISOString().slice(0, 10);
    // Include the October Taiwan closure relevant to this diagnostic scenario.
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6 && !(market === 'TW' && date === '2026-10-09')) dates.unshift(date);
  }
  return dates;
}
function chartFixture(target, end = expected, count = 80) {
  const dates = datesTo(end, count, target.market);
  const symbol = target.market === 'TW' ? `${target.ticker}.${target.listingBoard === 'TPEx' ? 'TWO' : 'TW'}` : target.ticker;
  return { chart: { result: [{
    meta: { symbol, currency: target.market === 'TW' ? 'TWD' : 'USD' },
    timestamp: dates.map(date => Date.parse(`${date}T${target.market === 'TW' ? '01:00' : '13:30'}:00Z`) / 1000),
    indicators: { quote: [{
      open: dates.map((_, i) => 100 + i), high: dates.map((_, i) => 102 + i),
      low: dates.map((_, i) => 99 + i), close: dates.map((_, i) => 101 + i),
      volume: dates.map(() => 1000000),
    }] },
  }] } };
}
function financialFixture(target) {
  const currency = target.market === 'TW' ? 'TWD' : 'USD';
  const series = (type, value, date = '2026-06-30') => ({ meta: { type: [type] }, [type]: [{
    asOfDate: date, periodType: type.startsWith('trailing') ? 'TTM' : '3M', currencyCode: currency,
    reportedValue: { raw: value },
  }] });
  return { timeseries: { result: [
    series('quarterlyTotalRevenue', 100),
    ...Object.entries({ TotalRevenue: 400, DilutedEPS: 4, NetIncome: 40, OperatingCashFlow: 80, CapitalExpenditure: -20 }).map(([key, value]) => series(`trailing${key}`, value)),
    ...Object.entries({ OrdinarySharesNumber: 10, StockholdersEquity: 200, TotalAssets: 400, TotalLiabilitiesNetMinorityInterest: 200 }).map(([key, value]) => series(`quarterly${key}`, value)),
    series('trailingTotalRevenue', 200, '2025-06-30'),
  ] } };
}
async function collect(target, chart, { now = refreshTime, chartStatus = 200, financialStatus = 200 } = {}) {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    const isChart = url.includes('/chart/');
    const status = isChart ? chartStatus : financialStatus;
    // Preserve intentionally non-JSON numbers in malformed parser fixtures.
    return { ok: status === 200, status, json: async () => isChart ? chart : financialFixture(target) };
  };
  const record = await fetchRefreshRecord(target, expected, now, fetcher);
  assert.equal(calls.length, 2);
  const symbol = target.market === 'TW' ? `${target.ticker}.${target.listingBoard === 'TPEx' ? 'TWO' : 'TW'}` : target.ticker;
  assert.ok(calls.some(url => url.includes(`/chart/${symbol}?`)));
  return record;
}
function originalQuoteOutcome(chart, market, now = refreshTime) {
  try {
    const candles = completedCandles(chart, market, now, expected), latest = candles.at(-1);
    if (candles.length < 60 || !latest || latest.date !== expected) return 'QUOTE_NOT_LATEST_COMPLETED_SESSION';
    if (!validRefreshCandles(candles, expected)) return 'INVALID_CAUSAL_HISTORY';
    return null;
  } catch (error) { return error.message; }
}
function assertMetadataOnly(summary) {
  assert.deepEqual(Object.keys(summary).sort(), [
    'expectedSessionDate', 'observedQuoteDate', 'rawLatestTimestamp', 'rawLatestDate', 'parsedLatestDate',
    'rawBarCount', 'parsedBarCount', 'completedBarCount', 'minimumBars', 'missingOhlcByField',
    'invalidOhlcRangeCount', 'expectedSessionRawBars', 'expectedSessionIncompleteOhlcBars',
    'invalidTimestampCount', 'failureReason', 'rawTail',
  ].sort());
  assert.deepEqual(Object.keys(summary.missingOhlcByField), ['open', 'high', 'low', 'close']);
  assert.ok(JSON.stringify(summary).length < 4500);
  assert.ok(!Object.values(summary).some(value => Array.isArray(value)));
}

for (const target of targets) {
  test(`${target.listingBoard ?? 'US'} ${target.ticker}: ready quotes retain exact expected/observed dates and bar counts`, async () => {
    const chart = chartFixture(target), record = await collect(target, chart), summary = record.quoteDiagnostics;
    assert.equal(originalQuoteOutcome(chart, target.market), null);
    assert.equal(record.status, 'ready'); assert.deepEqual(record.issues, []);
    assert.equal(record.quoteDate, expected); assert.equal(record.history.candles.length, 80);
    assert.equal(summary.expectedSessionDate, expected); assert.equal(summary.observedQuoteDate, expected);
    assert.equal(summary.rawLatestDate, expected); assert.equal(summary.parsedLatestDate, expected);
    assert.equal(summary.rawLatestTimestamp, chart.chart.result[0].timestamp.at(-1));
    assert.equal(summary.rawBarCount, 80); assert.equal(summary.parsedBarCount, 80); assert.equal(summary.completedBarCount, 80);
    assert.equal(summary.minimumBars, 60); assert.equal(summary.expectedSessionRawBars, 1);
    assert.equal(summary.expectedSessionIncompleteOhlcBars, 0); assert.equal(summary.invalidTimestampCount, 0);
    assert.equal(summary.invalidOhlcRangeCount, 0); assert.equal(summary.failureReason, null);
    assert.deepEqual(summary.missingOhlcByField, { open: 0, high: 0, low: 0, close: 0 });
    assertMetadataOnly(summary);
  });
}

test('expected raw date with incomplete final OHLC remains unavailable and exposes the discarded bar', async () => {
  const target = targets[0], chart = chartFixture(target);
  chart.chart.result[0].indicators.quote[0].close[79] = null;
  const record = await collect(target, chart), summary = record.quoteDiagnostics;
  assert.equal(record.status, 'unavailable'); assert.deepEqual(record.issues, [originalQuoteOutcome(chart, target.market)]);
  assert.deepEqual(record.issues, ['QUOTE_NOT_LATEST_COMPLETED_SESSION']);
  assert.equal(record.history, undefined); assert.equal(record.stock, undefined);
  assert.equal(summary.rawLatestDate, expected); assert.equal(summary.expectedSessionRawBars, 1);
  assert.equal(summary.expectedSessionIncompleteOhlcBars, 1); assert.equal(summary.missingOhlcByField.close, 1);
  assert.equal(summary.parsedBarCount, 79); assert.equal(summary.completedBarCount, 79);
  assert.equal(summary.parsedLatestDate, '2026-10-08'); assert.equal(summary.observedQuoteDate, '2026-10-08');
  assert.equal(record.quoteDate, summary.observedQuoteDate); assert.equal(summary.failureReason, 'LATEST_COMPLETED_SESSION_MISMATCH');
});

test('TPEx stale provider dates remain unavailable without inventing expected-session raw bars', async () => {
  const target = targets[1], chart = chartFixture(target, '2026-10-08'), record = await collect(target, chart), summary = record.quoteDiagnostics;
  assert.equal(record.status, 'unavailable'); assert.deepEqual(record.issues, [originalQuoteOutcome(chart, target.market)]);
  assert.equal(summary.rawLatestDate, '2026-10-08'); assert.equal(summary.observedQuoteDate, '2026-10-08');
  assert.equal(summary.completedBarCount, 80); assert.equal(summary.expectedSessionRawBars, 0);
  assert.equal(summary.expectedSessionIncompleteOhlcBars, 0); assert.equal(summary.failureReason, 'LATEST_COMPLETED_SESSION_MISMATCH');
});

test('insufficient history preserves the observed final date and has priority over a date mismatch', async () => {
  for (const end of [expected, '2026-10-09']) {
    const target = targets[2], chart = chartFixture(target, end, 59), record = await collect(target, chart);
    assert.equal(record.status, 'unavailable'); assert.deepEqual(record.issues, [originalQuoteOutcome(chart, target.market)]);
    assert.deepEqual(record.issues, ['QUOTE_NOT_LATEST_COMPLETED_SESSION']);
    assert.equal(record.history, undefined); assert.equal(record.quoteDate, end);
    assert.equal(record.quoteDiagnostics.observedQuoteDate, end); assert.equal(record.quoteDiagnostics.completedBarCount, 59);
    assert.equal(record.quoteDiagnostics.failureReason, 'INSUFFICIENT_COMPLETED_HISTORY');
  }
});

test('no parsed candles remains unavailable and distinguishes empty completed history from unknown parsing', async () => {
  const target = targets[0], chart = chartFixture(target, expected, 1);
  for (const field of ['open', 'high', 'low', 'close']) chart.chart.result[0].indicators.quote[0][field][0] = null;
  const record = await collect(target, chart), summary = record.quoteDiagnostics;
  assert.equal(record.status, 'unavailable'); assert.deepEqual(record.issues, [originalQuoteOutcome(chart, target.market)]);
  assert.equal(record.quoteDate, undefined); assert.equal(summary.observedQuoteDate, null);
  assert.equal(summary.rawLatestDate, expected); assert.equal(summary.parsedBarCount, 0); assert.equal(summary.completedBarCount, 0);
  assert.equal(summary.expectedSessionIncompleteOhlcBars, 1); assert.equal(summary.failureReason, 'NO_VALID_COMPLETED_CANDLES');
  assert.deepEqual(summary.missingOhlcByField, { open: 1, high: 1, low: 1, close: 1 });
});

for (const [target, now] of [[targets[0], refreshTime], [targets[2], new Date('2026-10-13T15:00:00Z')]]) {
  test(`${target.market}: intraday raw bar is observed but never added to completed history`, async () => {
    const chart = chartFixture(target), result = chart.chart.result[0];
    result.timestamp.push(Date.parse(`2026-10-13T${target.market === 'TW' ? '01:00' : '13:30'}:00Z`) / 1000);
    for (const field of ['open', 'high', 'low', 'close', 'volume']) result.indicators.quote[0][field].push(result.indicators.quote[0][field].at(-1));
    const original = completedCandles(chart, target.market, now), record = await collect(target, chart, { now }), summary = record.quoteDiagnostics;
    assert.equal(original.length, 80); assert.equal(original.at(-1).date, expected);
    assert.equal(originalQuoteOutcome(chart, target.market, now), null);
    assert.equal(record.status, 'ready'); assert.deepEqual(record.issues, []);
    assert.equal(summary.rawLatestDate, '2026-10-13'); assert.equal(summary.parsedLatestDate, '2026-10-13');
    assert.equal(summary.observedQuoteDate, expected); assert.equal(summary.rawBarCount, 81);
    assert.equal(summary.parsedBarCount, 81); assert.equal(summary.completedBarCount, 80); assert.equal(summary.failureReason, null);
  });
}

test('finite but inconsistent OHLC remains rejected by the original causal-history gate', async () => {
  const target = targets[1], chart = chartFixture(target), quote = chart.chart.result[0].indicators.quote[0];
  quote.open[20] = quote.high[20] + 1;
  const record = await collect(target, chart), summary = record.quoteDiagnostics;
  assert.equal(record.status, 'unavailable'); assert.deepEqual(record.issues, [originalQuoteOutcome(chart, target.market)]);
  assert.deepEqual(record.issues, ['INVALID_CAUSAL_HISTORY']);
  assert.equal(record.history, undefined); assert.equal(record.stock, undefined); assert.notEqual(record.rankingEligible, true);
  assert.equal(summary.invalidOhlcRangeCount, 1); assert.equal(summary.parsedBarCount, 80);
  assert.equal(summary.completedBarCount, 80); assert.equal(summary.observedQuoteDate, expected); assert.equal(summary.failureReason, 'INVALID_CAUSAL_HISTORY');
});

test('raw high below low is diagnosed while the unchanged parser drops the invalid final bar', async () => {
  const target = targets[0], chart = chartFixture(target), quote = chart.chart.result[0].indicators.quote[0];
  quote.high[79] = quote.low[79] - 1;
  const record = await collect(target, chart), summary = record.quoteDiagnostics;
  assert.equal(record.status, 'unavailable'); assert.deepEqual(record.issues, [originalQuoteOutcome(chart, target.market)]);
  assert.equal(summary.expectedSessionRawBars, 1); assert.equal(summary.expectedSessionIncompleteOhlcBars, 0);
  assert.equal(summary.invalidOhlcRangeCount, 1); assert.equal(summary.parsedBarCount, 79);
  assert.equal(summary.failureReason, 'LATEST_COMPLETED_SESSION_MISMATCH');
});

test('invalid timestamps preserve the original parser error and yield safe serializable raw metadata', async () => {
  for (const timestamp of [NaN, Infinity, -Infinity, 1e30]) {
    const target = targets[2], chart = chartFixture(target);
    chart.chart.result[0].timestamp[79] = timestamp;
    const record = await collect(target, chart), summary = record.quoteDiagnostics;
    assert.equal(record.status, 'unavailable'); assert.deepEqual(record.issues, [originalQuoteOutcome(chart, target.market)]);
    assert.deepEqual(record.issues, ['Invalid time value']);
    assert.equal(summary.invalidTimestampCount, 1); assert.equal(summary.rawLatestDate, null);
    assert.equal(summary.rawLatestTimestamp, Number.isFinite(timestamp) ? timestamp : null);
    assert.equal(summary.parsedBarCount, null); assert.equal(summary.completedBarCount, null);
    assert.equal(summary.observedQuoteDate, null); assert.equal(summary.failureReason, 'QUOTE_PARSE_FAILED');
    assert.deepEqual(JSON.parse(JSON.stringify(summary)), summary); assertMetadataOnly(summary);
  }
});

test('diagnostic summary treats malformed raw dates and missing OHLC safely without changing parser policy', () => {
  const payload = { chart: { result: [{ timestamp: [NaN, Infinity, 'invalid', null, 1e30], indicators: { quote: [{}] } }] } };
  const summary = summarizeQuoteDiagnostics(payload, expected);
  assert.equal(summary.rawBarCount, 5); assert.equal(summary.invalidTimestampCount, 5);
  assert.equal(summary.rawLatestDate, null); assert.equal(summary.expectedSessionRawBars, 0);
  assert.deepEqual(summary.missingOhlcByField, { open: 5, high: 5, low: 5, close: 5 });
  assert.doesNotThrow(() => summarizeQuoteDiagnostics(null, expected));
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), summary);
});

test('chart HTTP rejection keeps diagnostics absent and keeps the existing error; finance HTTP rejection retains completed quote summary', async () => {
  const target = targets[0], chart = chartFixture(target);
  const chartFailure = await collect(target, chart, { chartStatus: 503 });
  assert.equal(chartFailure.status, 'unavailable'); assert.deepEqual(chartFailure.issues, ['UPSTREAM_HTTP_503']);
  assert.equal(chartFailure.quoteDiagnostics, undefined); assert.equal(chartFailure.history, undefined);
  const financeFailure = await collect(target, chart, { financialStatus: 503 });
  assert.equal(financeFailure.status, 'unavailable'); assert.deepEqual(financeFailure.issues, ['UPSTREAM_HTTP_503']);
  assert.equal(financeFailure.history.candles.length, 80); assert.equal(financeFailure.stock, undefined);
  assert.equal(financeFailure.quoteDiagnostics.observedQuoteDate, expected); assert.equal(financeFailure.quoteDiagnostics.failureReason, null);
});

test('currency gate retains priority and remains unavailable with raw-only diagnostics', async () => {
  const target = targets[0], chart = chartFixture(target);
  chart.chart.result[0].meta.currency = 'USD';
  chart.chart.result[0].timestamp[79] = NaN;
  const record = await collect(target, chart), summary = record.quoteDiagnostics;
  assert.equal(record.status, 'unavailable'); assert.deepEqual(record.issues, ['QUOTE_CURRENCY_UNSUPPORTED']);
  assert.equal(summary.invalidTimestampCount, 1); assert.equal(summary.parsedBarCount, null);
  assert.equal(summary.failureReason, 'QUOTE_CURRENCY_UNSUPPORTED'); assert.equal(record.history, undefined);
});

test('400-bar parser limit remains authoritative; raw counts do not expand the accepted history', async () => {
  const target = targets[2], chart = chartFixture(target, expected, 450), record = await collect(target, chart);
  assert.equal(parseYahooDailyCandles(chart, 400).length, 400);
  assert.equal(record.status, 'ready'); assert.equal(record.history.candles.length, 400);
  assert.equal(record.quoteDiagnostics.rawBarCount, 450); assert.equal(record.quoteDiagnostics.parsedBarCount, 400);
  assert.equal(record.quoteDiagnostics.completedBarCount, 400); assert.equal(record.quoteDiagnostics.failureReason, null);
});
