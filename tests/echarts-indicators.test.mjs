import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("echarts candlestick chart configures EMA15, SMA50, and SMA20 with requested colors and default selections", async () => {
  const source = await readFile(new URL("../app/echarts-candlestick-chart.tsx", import.meta.url), "utf8");

  // Verify EMA & SMA functions exist
  assert.match(source, /function simpleMovingAverage/);
  assert.match(source, /function exponentialMovingAverage/);

  // Verify Legend configuration
  assert.match(source, /data:\s*\["EMA15",\s*"SMA50",\s*"SMA20"/);
  assert.match(source, /selected:\s*\{\s*EMA15:\s*true,\s*SMA50:\s*true,\s*SMA20:\s*false/);

  // Verify Series configuration: EMA15 (black #111827), SMA50 (red #dc2626), SMA20 (blue #2563eb)
  assert.match(source, /emaSeries\(15,\s*"EMA15",\s*"#111827"\)/);
  assert.match(source, /smaSeries\(50,\s*"SMA50",\s*"#dc2626"\)/);
  assert.match(source, /smaSeries\(20,\s*"SMA20",\s*"#2563eb"\)/);
});
