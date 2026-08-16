import assert from "node:assert/strict";
import test from "node:test";

const { detectTrendStructure, trendBoundaryValue } = await import("../lib/trend-structure.ts");

function makeActiveChannel(direction) {
  return Array.from({ length: 100 }, (_, index) => {
    const trendIndex = Math.max(0, index - 44);
    const center = index < 44
      ? 100
      : direction === "ascending" ? 100 + trendIndex * 0.45 : 150 - trendIndex * 0.55;
    const wave = index < 44 ? [0, 0.2, 0, -0.2][index % 4] : [0, 1.8, 0, -1.8][trendIndex % 4];
    return {
      date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String(index % 28 + 1).padStart(2, "0")}`,
      open: center + wave * 0.2,
      high: center + 5 + wave,
      low: center - 5 + wave,
      close: center + wave * 0.35,
      volume: 1000,
    };
  });
}

test("detects an active ascending channel from repeated recent pivots", () => {
  const structure = detectTrendStructure(makeActiveChannel("ascending"));
  assert.equal(structure.direction, "ascending");
  assert.ok(structure.channel);
  assert.ok(structure.trendline);
  assert.ok(structure.channel.lower.startIndex >= 44);
  assert.ok(structure.channel.lower.slope > 0);
  assert.ok(structure.channel.upper.slope > 0);
  assert.ok(trendBoundaryValue(structure.channel.lower, 99) > structure.channel.lower.startValue);
});

test("detects an active descending channel from repeated recent pivots", () => {
  const structure = detectTrendStructure(makeActiveChannel("descending"));
  assert.equal(structure.direction, "descending");
  assert.ok(structure.channel);
  assert.ok(structure.trendline);
  assert.ok(structure.channel.upper.startIndex >= 44);
  assert.ok(structure.channel.lower.slope < 0);
  assert.ok(structure.channel.upper.slope < 0);
});

test("does not force a trendline when the recent range is sideways", () => {
  const candles = makeActiveChannel("ascending").map((candle, index) => ({
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

test("does not call a late V-shaped recovery an ascending channel", () => {
  const candles = Array.from({ length: 80 }, (_, index) => {
    const center = index < 60 ? 100 + [0, 1, 0, -1][index % 4] : index < 68 ? 100 - (index - 59) * 2.5 : 80 + (index - 67) * 2.2;
    return {
      date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String(index % 28 + 1).padStart(2, "0")}`,
      open: center - 0.2,
      high: center + 2,
      low: center - 2,
      close: center + 0.2,
      volume: 1000,
    };
  });
  const structure = detectTrendStructure(candles);
  assert.equal(structure.direction, "sideways");
  assert.equal(structure.channel, null);
});
