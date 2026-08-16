import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fundPortfolioBusinessPeProfiles, fundPortfolioOverlapProfiles, fundPortfolioPeProfiles, fundPortfolioPeSummary, institutionalSignalForTicker } from "../lib/fund-signal.ts";
import { buildComparableMap } from "../lib/market-comparables.ts";
import { marketStockFromRatio } from "../lib/market-scan.ts";
import { calculateStock } from "../lib/valuation.ts";

const snapshotUrl = new URL("../lib/fund-holdings-snapshot.json", import.meta.url);
const snapshot = JSON.parse(await readFile(snapshotUrl, "utf8"));
const usSnapshotUrl = new URL("../lib/us-market-snapshot.json", import.meta.url);
const usSnapshot = JSON.parse(await readFile(usSnapshotUrl, "utf8"));

test("summarizes the reported TSLA holdings without changing valuation inputs", () => {
  const signal = institutionalSignalForTicker(snapshot, "tsla");
  assert.ok(signal);
  assert.equal(signal.trackedFundCount, 6);
  assert.equal(signal.heldByCount, 2);
  assert.equal(signal.increasedByCount, 2);
  assert.equal(signal.reducedByCount, 0);
  assert.deepEqual(signal.holdings.map((holding) => holding.fundName), ["Citadel Advisors", "D. E. Shaw"]);
  assert.ok(signal.holdings.every((holding) => holding.changeType === "increased"));
});

test("keeps industry and business-model P/E references distinct for representative holdings", () => {
  const byTicker = new Map(usSnapshot.map((row) => [row.ticker, row]));
  const value = (ticker) => {
    const row = byTicker.get(ticker);
    assert.ok(row, ticker);
    return calculateStock(marketStockFromRatio({ ...row, market: "US" }));
  };

  const aapl = value("AAPL");
  const mu = value("MU");
  const tsla = value("TSLA");

  // Mature quality technology is kept near the sector median, an AI-memory
  // cycle gets a bounded fund-distribution premium, and optionality is
  // allowed to use the upper tail.
  assert.ok((aapl.marketPricing?.selectedPe ?? 0) >= 30 && (aapl.marketPricing?.selectedPe ?? 0) < 42);
  assert.ok((mu.marketPricing?.selectedPe ?? 0) >= 100 && (mu.marketPricing?.selectedPe ?? 0) <= 140);
  assert.ok((tsla.marketPricing?.selectedPe ?? 0) >= 190 && (tsla.marketPricing?.selectedPe ?? 0) <= 220);
  assert.notEqual(aapl.marketPricing?.selectedPe, mu.marketPricing?.selectedPe);
  assert.notEqual(mu.marketPricing?.selectedPe, tsla.marketPricing?.selectedPe);
});

test("does not treat an absent top-holdings row as a zero-position assertion", () => {
  assert.equal(institutionalSignalForTicker(snapshot, "GDDY"), undefined);
});

test("normalizes Taiwan suffixes and infers missing change labels from percentage", () => {
  const signal = institutionalSignalForTicker({
    funds: [
      { rank: 1, name: "Fund A", holdings: [{ ticker: "2330.TW", changePercent: 12.5, valueUsd: 100 }] },
      { rank: 2, name: "Fund B", holdings: [{ ticker: "2330", changeType: "reduced", changePercent: -2, valueUsd: 80 }] },
    ],
  }, "2330.TW");
  assert.ok(signal);
  assert.equal(signal.heldByCount, 2);
  assert.equal(signal.increasedByCount, 1);
  assert.equal(signal.reducedByCount, 1);
});

test("calculates a transparent P/E profile for the latest six funds", () => {
  const summary = fundPortfolioPeSummary({
    funds: [
      { rank: 1, reportDate: "2026-03-31", holdings: [
        { ticker: "AAA", valueUsd: 100 },
        { ticker: "BBB", valueUsd: 300 },
      ] },
      { rank: 2, holdings: [{ ticker: "CCC", valueUsd: 100 }] },
    ],
  }, [
    { ticker: "AAA", price: 100, eps: 5 },
    { ticker: "BBB", pe: 20 },
    { ticker: "CCC", price: 30, eps: 3 },
  ]);

  assert.ok(summary);
  assert.equal(summary.sampleSize, 3);
  assert.equal(summary.uniqueSampleSize, 3);
  assert.equal(summary.averagePe, (20 + 20 + 10) / 3);
  assert.equal(summary.medianPe, 20);
  assert.equal(summary.lowerQuartilePe, 15);
  assert.equal(summary.upperQuartilePe, 20);
  assert.equal(summary.p90Pe, 20);
  assert.equal(summary.p95Pe, 20);
  assert.equal(summary.valueWeightedAveragePe, (20 * 100 + 20 * 300 + 10 * 100) / 500);
  assert.equal(summary.lowestPe, 10);
  assert.equal(summary.highestPe, 20);
  assert.equal(summary.uniqueMedianPe, 20);
  assert.equal(summary.reportDate, "2026-03-31");
});

test("classifies fund P/E references by financial-data freshness", () => {
  const summary = fundPortfolioPeSummary({
    funds: [{ holdings: [
      { ticker: "FRESH" },
      { ticker: "AGING" },
      { ticker: "STALE" },
      { ticker: "UNKNOWN" },
    ] }],
  }, [
    { ticker: "FRESH", pe: 20, financialDataDate: "2026-08-01" },
    { ticker: "AGING", pe: 20, financialDataDate: "2026-01-01" },
    { ticker: "STALE", pe: 20, financialDataDate: "2025-01-01" },
    { ticker: "UNKNOWN", pe: 20 },
  ], "2026-08-12");
  assert.ok(summary);
  assert.equal(summary.freshSampleSize, 1);
  assert.equal(summary.agingSampleSize, 1);
  assert.ok(summary.staleSampleSize >= 1);
  assert.equal(summary.unknownSampleSize, 1);
  assert.equal(summary.dataQuality, "mixed");
});

test("groups disclosed P/E observations by sector without changing valuation", () => {
  const profiles = fundPortfolioPeProfiles({
    funds: [
      { rank: 1, holdings: [
        { ticker: "AAA", valueUsd: 100, changeType: "increased" },
        { ticker: "BBB", valueUsd: 200, changeType: "reduced" },
      ] },
      { rank: 2, holdings: [{ ticker: "CCC", valueUsd: 50, changeType: "new" }] },
    ],
  }, [
    { ticker: "AAA", price: 100, eps: 5, sector: "Technology" },
    { ticker: "BBB", pe: 20, sector: "Technology" },
    { ticker: "CCC", price: 30, eps: 3, sector: "Health Care" },
  ]);

  assert.deepEqual(profiles.map((profile) => profile.sector), ["Technology", "Health Care"]);
  assert.equal(profiles[0].sampleSize, 2);
  assert.equal(profiles[0].uniqueSampleSize, 2);
  assert.equal(profiles[0].uniqueMedianPe, 20);
  assert.equal(profiles[0].medianPe, 20);
  assert.equal(profiles[0].increasedCount, 1);
  assert.equal(profiles[0].reducedCount, 1);
  assert.equal(profiles[1].medianPe, 10);
  assert.equal(profiles[1].increasedCount, 1);
});

test("reports a separate unique-ticker P/E profile when several funds own the same name", () => {
  const summary = fundPortfolioPeSummary({
    funds: [
      { rank: 1, holdings: [{ ticker: "AAA", valueUsd: 100 }] },
      { rank: 2, holdings: [{ ticker: "AAA", valueUsd: 200 }, { ticker: "BBB", valueUsd: 100 }] },
    ],
  }, [
    { ticker: "AAA", price: 100, eps: 5 },
    { ticker: "BBB", price: 100, eps: 10 },
  ]);
  assert.ok(summary);
  assert.equal(summary.sampleSize, 3);
  assert.equal(summary.uniqueSampleSize, 2);
  assert.equal(summary.uniqueMedianPe, 15);
});

test("finds the current six-fund P/E pattern without treating it as a target price", () => {
  const references = usSnapshot.map((row) => ({
    ticker: row.ticker,
    price: row.price,
    eps: row.eps,
    sector: row.sector,
    financialDataDate: row.financialDataDate ?? row.date,
  }));
  const summary = fundPortfolioPeSummary(snapshot, references, "2026-08-12");
  const profiles = fundPortfolioPeProfiles(snapshot, references, "2026-08-12");
  assert.ok(summary);
  assert.ok(summary.sampleSize >= 50);
  assert.ok(summary.medianPe > 35 && summary.medianPe < 50);
  assert.ok(summary.p95Pe > 200);
  assert.ok(summary.staleSampleSize >= 1);
  assert.ok(summary.agingSampleSize >= 30);
  assert.equal(summary.dataQuality, "mixed");
  assert.ok((summary.medianFinancialAgeDays ?? 0) > 180);

  const technology = profiles.find((profile) => profile.sector === "Technology");
  assert.ok(technology);
  assert.ok(technology.sampleSize >= 30);
  assert.ok((technology.uniqueSampleSize ?? 0) < technology.sampleSize);
  assert.ok((technology.uniqueMedianPe ?? 0) > 0);
  assert.ok(technology.lowerQuartilePe < technology.medianPe);
  assert.ok(technology.p95Pe > technology.upperQuartilePe);
  assert.ok(technology.agingSampleSize > 0);

  const industrials = profiles.find((profile) => profile.sector === "Industrials");
  assert.ok(industrials);
  assert.ok(industrials.sampleSize >= 4);
  assert.ok(industrials.medianPe > 40);

  // MU and TSLA illustrate why the page keeps this as context: both are
  // heavily accumulated, yet their current trailing P/E is dominated by
  // different earnings-cycle/optionality assumptions.
  assert.equal(institutionalSignalForTicker(snapshot, "MU")?.increasedByCount, 3);
  assert.equal(institutionalSignalForTicker(snapshot, "TSLA")?.increasedByCount, 2);
  const memory = fundPortfolioBusinessPeProfiles(snapshot, references, "2026-08-12").find((profile) => profile.group === "memory-cycle");
  assert.ok(memory && memory.uniqueMedianPe > memory.medianPe);
  assert.ok(memory && memory.uniqueUpperQuartilePe < memory.p95Pe);
});

test("identifies repeated holdings without converting crowding into fair value", () => {
  const references = usSnapshot.map((row) => ({
    ticker: row.ticker,
    price: row.price,
    eps: row.eps,
    sector: row.sector,
  }));
  const overlaps = fundPortfolioOverlapProfiles(snapshot, references);
  const msft = overlaps.find((profile) => profile.ticker === "MSFT");
  const tsla = overlaps.find((profile) => profile.ticker === "TSLA");
  assert.ok(msft);
  assert.equal(msft.fundCount, 5);
  assert.equal(msft.increasedCount, 2);
  assert.equal(msft.reducedCount, 3);
  assert.ok(msft.pe > 0);
  assert.ok(tsla);
  assert.equal(tsla.fundCount, 2);
  assert.equal(tsla.increasedCount, 2);
  assert.equal(tsla.reducedCount, 0);
  assert.ok(tsla.averageChangePercent > 100);
});

test("runs the valuation audit across matched six-fund holdings", () => {
  const comparableMap = buildComparableMap(usSnapshot);
  const byTicker = new Map(usSnapshot.map((row) => [row.ticker, row]));
  const tickers = new Set(snapshot.funds.flatMap((fund) => fund.holdings.map((holding) => holding.ticker)));
  const matched = [...tickers]
    .map((ticker) => byTicker.get(ticker))
    .filter(Boolean)
    .map((row) => marketStockFromRatio({ ...row, market: "US" }, comparableMap.get(row.ticker)))
    .filter(Boolean);

  assert.ok(matched.length >= 30);
  for (const input of matched) {
    const stock = calculateStock(input);
    if (input.sector === "Real Estate") {
      // Public snapshot rows do not expose FFO/AFFO. The engine must remain
      // explicit about the missing REIT-specific denominator rather than
      // substituting EPS or a generic DCF.
      assert.ok(Number.isFinite(stock.fairValue), input.ticker);
      assert.ok(stock.models.every((model) => model.id === "pb"), input.ticker + " used a non-REIT model");
      assert.ok(stock.historicalCautionReasons.some((reason) => reason.includes("FFO")), input.ticker);
      continue;
    }
    assert.ok(Number.isFinite(stock.fairValue) && stock.fairValue > 0, input.ticker);
    assert.ok(stock.models.length >= 1, input.ticker + " has no applicable model");
    assert.ok(stock.models.every((model) => Number.isFinite(model.value)), input.ticker + " has a non-finite model");
  }

  const tsla = calculateStock(marketStockFromRatio(
    { ...byTicker.get("TSLA"), market: "US" },
    comparableMap.get("TSLA"),
  ));
  assert.ok(tsla.models.some((model) => model.id === "dcf-ebitda-5y"));
  assert.ok(tsla.historicalCautionReasons.some((reason) => reason.includes("退出法")));
});
