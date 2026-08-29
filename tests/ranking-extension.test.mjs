import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import marketScanSnapshot from "../lib/market-scan-snapshot.json" with { type: "json" };

test("fair-value ranking provides deep candidate pools and extension controls", async () => {
  // Snapshot has expanded pools for Taiwan and US
  const twUndervalued = marketScanSnapshot.candidates.filter((s) => s.market === "TW");
  const usUndervalued = marketScanSnapshot.candidates.filter((s) => s.market === "US");
  const twOvervalued = marketScanSnapshot.overvaluedCandidates.filter((s) => s.market === "TW");
  const usOvervalued = marketScanSnapshot.overvaluedCandidates.filter((s) => s.market === "US");

  assert.ok(twUndervalued.length >= 40, `TW undervalued pool should be >= 40, got ${twUndervalued.length}`);
  assert.ok(usUndervalued.length >= 40, `US undervalued pool should be >= 40, got ${usUndervalued.length}`);
  assert.ok(twOvervalued.length >= 40, `TW overvalued pool should be >= 40, got ${twOvervalued.length}`);
  assert.ok(usOvervalued.length >= 40, `US overvalued pool should be >= 40, got ${usOvervalued.length}`);

  // Check UI code in page.tsx
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /setTwDisplayLimit\(\(prev\) => prev \+ 20\)/);
  assert.match(source, /setUsDisplayLimit\(\(prev\) => prev \+ 20\)/);
  assert.match(source, /延伸 20 檔台股排行/);
  assert.match(source, /延伸 20 檔美股排行/);
  assert.match(source, /useState<SortKey>\("recommended"\)/);
  assert.match(source, /sortKey === "recommended"\) return filtered/);
  assert.match(source, /<option value="recommended">/);
});
