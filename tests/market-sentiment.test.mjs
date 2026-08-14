import assert from "node:assert/strict";
import test from "node:test";
import { classifyVix, parseYahooSentimentSeries, volatilityCurveLabel } from "../lib/market-sentiment.ts";

function payload(values) {
  return {
    chart: {
      result: [{
        meta: { regularMarketPrice: values.at(-1), chartPreviousClose: values.at(-2) },
        timestamp: values.map((_, index) => 1_767_225_600 + index * 86_400),
        indicators: { quote: [{ close: values }] },
      }],
    },
  };
}

test("parses a Yahoo sentiment series and 20-day return", () => {
  const values = Array.from({ length: 30 }, (_, index) => 15 + index * 0.2);
  const result = parseYahooSentimentSeries(payload(values), "^VIX", "VIX");
  assert.ok(result);
  assert.equal(result.history.length, 30);
  assert.ok((result.return20d ?? 0) > 20);
});

test("classifies volatility without turning it into a buy or sell command", () => {
  assert.equal(classifyVix(13).level, "calm");
  assert.equal(classifyVix(13).titleZh, "市場氣氛偏樂觀");
  assert.equal(classifyVix(18).level, "normal");
  assert.equal(classifyVix(24).level, "cautious");
  assert.equal(classifyVix(32).level, "stressed");
  assert.match(classifyVix(13).guidanceZh, /避免追價/);
});

test("detects an inverted short-term volatility curve", () => {
  const curve = volatilityCurveLabel(28, 24, 22);
  assert.equal(curve.shape, "inverted");
  assert.ok((curve.shortTermRatio ?? 0) > 1.2);
});
