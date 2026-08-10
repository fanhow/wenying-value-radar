import assert from "node:assert/strict";
import test from "node:test";
import { marketCandidateFromRatio, selectTopMarketCandidates } from "../lib/market-scan.ts";

test("selects a materially undervalued exchange ratio candidate", () => {
  const candidate = marketCandidateFromRatio({
    ticker: "1234",
    name: "Value Co",
    price: 50,
    pe: 7,
    pb: 0.8,
    sector: "台灣上市公司",
  });
  assert.equal(candidate?.ticker, "1234");
});

test("rejects expensive or non-equity rows from the market scan", () => {
  assert.equal(marketCandidateFromRatio({ ticker: "5678", name: "Expensive", price: 100, pe: 50, pb: 10, sector: "台灣上市公司" }), null);
  assert.equal(marketCandidateFromRatio({ ticker: "00631L", name: "ETF", price: 100, pe: 10, pb: 1, sector: "ETF" }), null);
  assert.equal(marketCandidateFromRatio({ ticker: "TINY", name: "Tiny", market: "US", price: 10, pe: 7, pb: 0.8, eps: 1.4, bvps: 12, marketCap: 100_000_000, volume: 500_000, sector: "Industrials" }), null);
});

test("limits each market ranking to its requested top count", () => {
  const universe = Array.from({ length: 25 }, (_, index) => ({
    ticker: String(1000 + index),
    name: `Value ${index}`,
    price: 50,
    pe: 7,
    pb: 0.8,
    sector: "台灣上市公司",
  }));
  assert.equal(selectTopMarketCandidates(universe, 20).length, 20);
});
