import assert from "node:assert/strict";
import test from "node:test";

const { detectTrendStructure, trendBoundaryValue } = await import("../lib/trend-structure.ts");

function makeChannel(direction) {
  return Array.from({ length: 60 }, (_, index) => {
    const center = direction === "ascending" ? 100 + index * 0.45 : 150 - index * 0.55;
    return {
      date: `2026-01-${String(index + 1).padStart(2, "0")}`,
      open: center,
      high: center + 5,
      low: center - 5,
      close: center + (index % 2 ? 0.2 : -0.2),
      volume: 1000,
    };
  });
}

test("detects an ascending channel from the recent high/low envelopes", () => {
  const structure = detectTrendStructure(makeChannel("ascending"));
  assert.equal(structure.direction, "ascending");
  assert.ok(structure.channel);
  assert.ok(structure.trendline);
  assert.ok(structure.channel.lower.slope > 0);
  assert.ok(structure.channel.upper.slope > 0);
  assert.ok(trendBoundaryValue(structure.channel.lower, 59) > structure.channel.lower.startValue);
});

test("detects a descending channel from the recent high/low envelopes", () => {
  const structure = detectTrendStructure(makeChannel("descending"));
  assert.equal(structure.direction, "descending");
  assert.ok(structure.channel);
  assert.ok(structure.trendline);
  assert.ok(structure.channel.lower.slope < 0);
  assert.ok(structure.channel.upper.slope < 0);
});

test("does not force a trendline when the recent range is sideways", () => {
  const candles = makeChannel("ascending").map((candle, index) => ({
    ...candle,
    open: 100 + (index % 4) * 0.05,
    high: 102 + (index % 3) * 0.05,
    low: 98 - (index % 3) * 0.05,
    close: 100 + (index % 2) * 0.03,
  }));
  const structure = detectTrendStructure(candles);
  assert.equal(structure.direction, "sideways");
  assert.equal(structure.trendline, null);
  assert.equal(structure.channel, null);
});
