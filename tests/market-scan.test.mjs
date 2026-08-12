import assert from "node:assert/strict";
import test from "node:test";
import {
  marketCandidateFromRatio,
  hasCandidateLiquidity,
  marketStockFromRatio,
  selectMarketCandidates,
  selectTopMarketCandidates,
} from "../lib/market-scan.ts";
import { buildComparableMap } from "../lib/market-comparables.ts";
import fundHoldingsSnapshot from "../lib/fund-holdings-snapshot.json" with { type: "json" };
import usMarketSnapshot from "../lib/us-market-snapshot.json" with { type: "json" };

test("selects a materially undervalued exchange ratio candidate", () => {
  const candidate = marketCandidateFromRatio({
    ticker: "1234",
    name: "Value Co",
    price: 50,
    pe: 7,
    pb: 0.8,
    sector: "台灣上市公司",
    volume: 1_000_000,
  });
  assert.equal(candidate?.ticker, "1234");
});

test("rejects expensive or non-equity rows from the market scan", () => {
  assert.equal(marketCandidateFromRatio({ ticker: "5678", name: "Expensive", price: 100, pe: 50, pb: 10, volume: 1_000_000, sector: "台灣上市公司" }), null);
  assert.equal(marketCandidateFromRatio({ ticker: "00631L", name: "ETF", price: 100, pe: 10, pb: 1, sector: "ETF" }), null);
  assert.equal(marketCandidateFromRatio({ ticker: "TINY", name: "Tiny", market: "US", price: 10, pe: 7, pb: 0.8, eps: 1.4, bvps: 12, marketCap: 100_000_000, volume: 500_000, sector: "Industrials" }), null);
});

test("removes illiquid Taiwan candidates and Taiwan ETFs", () => {
  assert.equal(hasCandidateLiquidity({ ticker: "6171", name: "Illiquid", price: 24.55, pe: 10, pb: 1, volume: 1_000, sector: "Taiwan listed company" }), false);
  assert.equal(hasCandidateLiquidity({ ticker: "2324", name: "Compal", price: 35, pe: 10, pb: 1, volume: 2_000_000, sector: "Taiwan listed company" }), true);
  assert.equal(hasCandidateLiquidity({ ticker: "0050", name: "ETF", price: 100, pe: 10, pb: 1, volume: 2_000_000, sector: "ETF" }), false);
});

test("limits each market ranking to its requested top count", () => {
  const universe = Array.from({ length: 25 }, (_, index) => ({
    ticker: String(1000 + index),
    name: `Value ${index}`,
    price: 50,
    pe: 7,
    pb: 0.8,
    sector: "台灣上市公司",
    volume: 1_000_000,
  }));
  assert.equal(selectTopMarketCandidates(universe, 20).length, 20);
});

test("passes optional annual SEC fields into the valuation engine", () => {
  const stock = marketStockFromRatio({
    ticker: "TEST",
    name: "Test Corporation",
    market: "US",
    price: 100,
    pe: 20,
    pb: 5,
    eps: 5,
    bvps: 20,
    revenuePerShare: 30,
    ebitPerShare: 7,
    ebitdaPerShare: 8,
    cashPerShare: 4,
    debtPerShare: 6,
    netMargin: 16.7,
    assetTurnover: 1.1,
    financialLeverage: 2.2,
    financialDataDate: "2025-12-31",
    marketCap: 10_000_000_000,
    volume: 1_000_000,
    sector: "Technology",
  });

  assert.equal(stock?.revenuePerShare, 30);
  assert.equal(stock?.ebitPerShare, 7);
  assert.equal(stock?.ebitdaPerShare, 8);
  assert.equal(stock?.cashPerShare, 4);
  assert.equal(stock?.debtPerShare, 6);
  assert.equal(stock?.netMargin, 16.7);
  assert.equal(stock?.assetTurnover, 1.1);
  assert.equal(stock?.financialLeverage, 2.2);
  assert.equal(stock?.dataBasis, "annual");
  assert.equal(stock?.financialDataDate, "2025-12-31");
});

test("passes six-fund ownership and sector P/E context into U.S. scan rows", () => {
  const row = usMarketSnapshot.find((candidate) => candidate.ticker === "AAPL");
  assert.ok(row);
  const stock = marketStockFromRatio({ ...row, market: "US" });

  assert.ok(stock);
  assert.equal(stock.institutionalSignal?.heldByCount, 3);
  assert.equal(stock.institutionalSignal?.increasedByCount, 1);
  assert.equal(stock.fundSectorPe?.sector, "Technology");
  assert.ok((stock.fundSectorPe?.sampleSize ?? 0) >= 30);
  assert.equal(stock.institutionalSignal?.reportDate, fundHoldingsSnapshot.funds[0].reportDate);

  const businessRow = usMarketSnapshot.find((candidate) => candidate.ticker === "AMZN");
  assert.ok(businessRow);
  const businessStock = marketStockFromRatio({ ...businessRow, market: "US" });
  assert.equal(businessStock?.fundBusinessPe?.group, "platform-software");
  assert.ok((businessStock?.fundBusinessPe?.uniqueSampleSize ?? 0) >= 5);
});

test("keeps a profitable U.S. asset-light row when book value is unavailable", () => {
  const stock = marketStockFromRatio({
    ticker: "AVGO",
    name: "Broadcom",
    market: "US",
    price: 100,
    pe: 20,
    pb: 0,
    eps: 5,
    bvps: 0,
    marketCap: 2_000_000_000,
    volume: 1_000_000,
    sector: "Technology",
  });

  assert.ok(stock);
  assert.equal(stock.bvps, 0);
  assert.equal(stock.eps, 5);
});

test("adds public peer multiples only when a same-sector benchmark is available", () => {
  const universe = Array.from({ length: 7 }, (_, index) => ({
    ticker: `T${index}`,
    name: `Technology ${index}`,
    market: "US",
    price: 100 + index,
    pe: 0,
    pb: 3,
    eps: 5,
    bvps: 20,
    revenuePerShare: 20,
    ebitPerShare: 6,
    ebitdaPerShare: 8,
    cashPerShare: 1,
    debtPerShare: 2,
    netMargin: 20,
    revenueGrowth: 8,
    debtRatio: 30,
    marketCap: 2_000_000_000,
    volume: 1_000_000,
    sector: "Technology",
    dataBasis: "annual",
  }));
  const comparableMap = buildComparableMap(universe);
  const profile = comparableMap.get("T0");
  const stock = marketStockFromRatio(universe[0], profile);
  assert.ok(stock);
  assert.ok(stock.comparableMultiples);
  assert.equal(stock.targetPsMultiple, stock.comparableMultiples.psMedian);
  assert.equal(stock.targetEvRevenueMultiple, stock.comparableMultiples.evRevenueMedian);
});

test("marks Taiwan ratio rows as market-ratio data", () => {
  const stock = marketStockFromRatio({
    ticker: "2330",
    name: "TSMC",
    price: 100,
    pe: 10,
    pb: 2,
    sector: "Taiwan listed company",
  });

  assert.equal(stock?.dataBasis, "market-ratio");
  assert.equal(stock?.revenuePerShare, undefined);
});

test("selects and sorts the most overvalued candidates", () => {
  const universe = Array.from({ length: 25 }, (_, index) => ({
    ticker: String(2000 + index),
    name: `Expensive ${index}`,
    price: 100 + index * 5,
    pe: 60 + index,
    pb: 8,
    sector: "台灣上市公司",
    volume: 1_000_000,
  }));
  const selected = selectMarketCandidates(universe, "overvalued", 20);
  assert.equal(selected.length, 20);
  assert.equal(selected[0].ticker, "2024");
});

test("does not rank an overvalued row without a finite fair value model", () => {
  const selected = selectMarketCandidates([{
    ticker: "HUGE",
    name: "Overflow Corporation",
    market: "US",
    price: Number.MAX_VALUE,
    pe: 1,
    pb: 1,
    eps: Number.MAX_VALUE,
    bvps: Number.MAX_VALUE,
    marketCap: Number.MAX_VALUE,
    volume: 1_000_000,
    sector: "Technology",
  }], "overvalued", 20);

  assert.deepEqual(selected, []);
});
