import assert from "node:assert/strict";
import test from "node:test";
import { parseYahooDailyCandles, yahooHistorySymbols } from "../lib/price-history.ts";

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

