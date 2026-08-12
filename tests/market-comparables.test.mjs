import assert from "node:assert/strict";
import test from "node:test";
import { buildComparableMap, comparableMultiplesForRow } from "../lib/market-comparables.ts";

function row(ticker, sector, price, eps, revenue, ebitda, ebit, marketCap = 2_000_000_000) {
  return {
    ticker,
    market: "US",
    sector,
    price,
    eps,
    revenuePerShare: revenue,
    ebitdaPerShare: ebitda,
    ebitPerShare: ebit,
    cashPerShare: 1,
    debtPerShare: 2,
    marketCap,
    dataBasis: "annual",
    financialDataDate: "2025-12-31",
  };
}

test("builds independent trimmed peer multiples by sector", () => {
  const peers = [
    row("A", "Technology", 100, 5, 20, 8, 6),
    row("B", "Technology", 110, 5, 22, 8.5, 6.5),
    row("C", "Technology", 90, 5, 18, 7.5, 5.5),
    row("D", "Technology", 105, 5, 21, 8.2, 6.2),
    row("E", "Technology", 95, 5, 19, 7.8, 5.8),
    row("G", "Technology", 102, 5, 20.4, 8.1, 6.1),
    row("F", "Technology", 1000, 0.1, 1, 0.5, 0.3),
    row("BANK", "Finance", 40, 4, 10, 5, 4),
  ];
  const profile = comparableMultiplesForRow(peers[0], peers);
  assert.ok(profile);
  assert.equal(profile.method, "sector-trimmed-median");
  assert.equal(profile.sector, "Technology");
  assert.equal(profile.peerCount, 6);
  assert.equal(profile.pePeerCount, 5);
  assert.ok(profile.peMedian > 15 && profile.peMedian < 25);
  assert.ok(profile.psMedian > 4 && profile.psMedian < 6);
  assert.equal(profile.evRevenuePeerCount, 5);
  assert.ok(profile.evRevenueMedian > 4 && profile.evRevenueMedian < 6);
  assert.ok(!profile.sector.includes("Finance"));
});

test("uses a known business-model peer group without losing missing metric fallbacks", () => {
  const base = [
    row("MU", "Technology", 100, 5, 20, 8, 6),
    row("SIMO", "Technology", 120, 4, 18, 7, 5),
    row("SNDK", "Technology", 140, 3, 16, 6, 4),
    row("WDC", "Technology", 80, 2, 14, 5, 3),
    row("STX", "Technology", 90, 2.5, 15, 5.5, 3.5),
    row("NVDA", "Technology", 200, 10, 15, 9, 7),
    row("AMD", "Technology", 150, 8, 14, 8, 6),
    row("AVGO", "Technology", 180, 9, 13, 7, 5),
    row("MRVL", "Technology", 100, 5, 12, 6, 4),
    row("ARM", "Technology", 160, 8, 11, 5, 3),
    row("AAPL", "Technology", 100, 5, 20, 8, 6),
    row("MSFT", "Technology", 100, 5, 20, 8, 6),
    row("GOOGL", "Technology", 100, 5, 20, 8, 6),
    row("META", "Technology", 100, 5, 20, 8, 6),
  ];
  const profile = buildComparableMap(base).get("MU");
  assert.ok(profile);
  assert.equal(profile.peerGroup, "memory-cycle");
  assert.equal(profile.method, "business-group-with-sector-fallback");
  assert.equal(profile.peerCount, 4);
  assert.ok(profile.pePeerCount >= 4);
  assert.ok(profile.evEbitdaPeerCount >= 4);
});

test("requires a minimum number of same-sector peers and never derives EV from PE", () => {
  const target = row("TARGET", "Technology", 100, 5, 20, 8, 6);
  const few = [target, row("A", "Technology", 100, 5, 20, 8, 6), row("B", "Technology", 100, 5, 20, 8, 6)];
  assert.equal(comparableMultiplesForRow(target, few), undefined);

  const enough = [
    target,
    row("A", "Technology", 100, 5, 20, 8, 6),
    row("B", "Technology", 100, 5, 20, 8, 6),
    row("C", "Technology", 100, 5, 20, 8, 6),
    row("D", "Technology", 100, 5, 20, 8, 6),
    row("E", "Technology", 100, 5, 20, 8, 6),
  ];
  const map = buildComparableMap(enough);
  const profile = map.get("TARGET");
  assert.ok(profile);
  assert.equal(profile.evRevenueMedian, 5.05);
  assert.equal(profile.peMedian, 20);
});

test("normalizes curated sector corrections before building peer multiples", () => {
  const target = row("GEV", "Technology", 100, 5, 20, 8, 6);
  const peers = [
    target,
    row("GE", "Technology", 100, 5, 20, 8, 6),
    row("ETN", "Industrials", 100, 5, 20, 8, 6),
    row("PWR", "Industrials", 100, 5, 20, 8, 6),
    row("HUBB", "Industrials", 100, 5, 20, 8, 6),
    row("EME", "Industrials", 100, 5, 20, 8, 6),
    row("VRT", "Technology", 100, 5, 20, 8, 6),
  ];
  const profile = comparableMultiplesForRow(target, peers);
  assert.ok(profile);
  assert.equal(profile.sector, "Industrials");
  assert.equal(profile.peerCount, 5);
});
