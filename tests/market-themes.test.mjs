import assert from "node:assert/strict";
import test from "node:test";
import {
  matchStructuralThemes,
  structuralThemeSnapshot,
  THEME_REVIEW_AFTER,
  THEME_SNAPSHOT_AS_OF,
} from "../lib/market-themes.ts";

test("matches only curated tickers or specific business descriptors", () => {
  assert.deepEqual(
    matchStructuralThemes({ ticker: "NVDA", name: "NVIDIA Corporation", sector: "Technology" }).map((theme) => theme.id),
    ["ai-infrastructure"],
  );
  assert.deepEqual(
    matchStructuralThemes({ ticker: "PANW", name: "Palo Alto Networks", sector: "Technology" }).map((theme) => theme.id),
    ["cybersecurity"],
  );
  assert.deepEqual(
    matchStructuralThemes({ ticker: "NONE", name: "Generic Technology Holdings", sector: "Technology" }),
    [],
  );
});

test("publishes a dated six-theme evidence snapshot with official links", () => {
  const themes = structuralThemeSnapshot();
  assert.equal(themes.length, 6);
  assert.equal(THEME_SNAPSHOT_AS_OF, "2026-08-11");
  assert.equal(THEME_REVIEW_AFTER, "2026-09-11");
  for (const theme of themes) {
    assert.ok(theme.growthLow > 0);
    assert.ok(theme.growthLow < theme.growthBase);
    assert.ok(theme.growthBase < theme.growthHigh);
    assert.ok(theme.sources.length >= 2);
    assert.ok(theme.sources.every((source) => source.url.startsWith("https://")));
  }
});
