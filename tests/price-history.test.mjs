import assert from "node:assert/strict";
import test from "node:test";
import { latestMarketQuoteFromCandles, parseYahooCorporateActions, parseYahooDailyCandles, taiwanLimitUpPrice, tradingViewSymbolFromYahoo, yahooHistorySymbols } from "../lib/price-history.ts";

test("parses aligned Yahoo daily OHLCV rows and drops incomplete candles", () => {
  const candles = parseYahooDailyCandles({ chart: { result: [{
    timestamp: [1_700_000_000, 1_700_086_400],
    indicators: { quote: [{
      open: [10, null], high: [12, 13], low: [9, 11], close: [11, 12], volume: [1000, 2000],
    }] },
  }] } });
  assert.deepEqual(candles, [{ date: "2023-11-14", open: 10, high: 12, low: 9, close: 11, volume: 1000 }]);
});

test("tries listed then OTC suffixes for Taiwan tickers", () => {
  assert.deepEqual(yahooHistorySymbols("2324", "TW"), ["2324.TW", "2324.TWO"]);
  assert.deepEqual(yahooHistorySymbols("AAPL", "US"), ["AAPL"]);
});

test("maps Yahoo exchange metadata to TradingView symbols", () => {
  assert.equal(tradingViewSymbolFromYahoo({ chart: { result: [{ meta: { symbol: "1808.TW", exchangeName: "TAI" } }] } }, "1808.TW"), "TWSE:1808");
  assert.equal(tradingViewSymbolFromYahoo({ chart: { result: [{ meta: { symbol: "6488.TWO", exchangeName: "TWO" } }] } }, "6488.TWO"), "TPEX:6488");
  assert.equal(tradingViewSymbolFromYahoo({ chart: { result: [{ meta: { symbol: "AMAT", exchangeName: "NMS" } }] } }, "AMAT"), "NASDAQ:AMAT");
  assert.equal(tradingViewSymbolFromYahoo({ chart: { result: [{ meta: { symbol: "SO", exchangeName: "NYQ" } }] } }, "SO"), "NYSE:SO");
});

test("detects stock distributions and capital adjustments without changing valuation", () => {
  const actions = parseYahooCorporateActions({ chart: { result: [{ events: { splits: {
    a: { date: 1_727_312_400, numerator: 2200, denominator: 1000, splitRatio: "2200:1000" },
    b: { date: 1_762_995_600, numerator: 900, denominator: 1000, splitRatio: "900:1000" },
  } } }] } }, new Date("2026-08-12T00:00:00.000Z"));
  assert.deepEqual(actions.map((action) => [action.type, action.ratio]), [
    ["capital-adjustment", 0.9],
    ["stock-distribution", 2.2],
  ]);
});

test("calculates the Taiwan limit-up price using the local tick size", () => {
  assert.equal(taiwanLimitUpPrice(54.1), 59.5);
  const quote = latestMarketQuoteFromCandles([
    { date: "2026-08-13", open: 54.8, high: 55, low: 53.8, close: 54.1, volume: 2_692_826 },
    { date: "2026-08-14", open: 57.3, high: 59.5, low: 57.2, close: 59.5, volume: 14_039_503 },
  ], "TW");
  assert.equal(quote?.limitUpPrice, 59.5);
  assert.equal(quote?.isLimitUp, true);
  assert.ok(Math.abs((quote?.changePercent ?? 0) - 0.099815) < 0.00001);
});
