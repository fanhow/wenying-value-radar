import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildComparableMap } from "../lib/market-comparables.ts";
import { marketStockFromRatio } from "../lib/market-scan.ts";
import { fundManagerPeProfiles, fundPortfolioBusinessPeProfiles, fundPortfolioPeProfiles } from "../lib/fund-signal.ts";
import { calculateStock } from "../lib/valuation.ts";

const snapshot = JSON.parse(await readFile(new URL("../lib/fund-holdings-snapshot.json", import.meta.url), "utf8"));
const usSnapshot = JSON.parse(await readFile(new URL("../lib/us-market-snapshot.json", import.meta.url), "utf8"));

test("finds cross-sector P/E bands and keeps fund market context separate", () => {
  const comparableMap = buildComparableMap(usSnapshot);
  const byTicker = new Map(usSnapshot.map((row) => [row.ticker, row]));
  const valuationFor = (ticker) => {
    const row = byTicker.get(ticker);
    assert.ok(row, ticker);
    const input = marketStockFromRatio({ ...row, market: "US" }, comparableMap.get(ticker));
    assert.ok(input, ticker);
    return { input, stock: calculateStock(input) };
  };

  const aapl = valuationFor("AAPL");
  const mu = valuationFor("MU");
  const tsla = valuationFor("TSLA");
  const nvda = valuationFor("NVDA");
  const msft = valuationFor("MSFT");
  const googl = valuationFor("GOOGL");

  const references = usSnapshot.map((row) => ({
    ticker: row.ticker,
    price: row.price,
    eps: row.eps,
    sector: row.sector,
    financialDataDate: row.financialDataDate ?? row.date,
  }));
  const profiles = fundPortfolioPeProfiles(snapshot, references, "2026-08-12");
  const businessProfiles = fundPortfolioBusinessPeProfiles(snapshot, references, "2026-08-12");
  const managerProfiles = fundManagerPeProfiles(snapshot, references, "2026-08-12");
  const technology = profiles.find((profile) => profile.sector === "Technology");
  const finance = profiles.find((profile) => profile.sector === "Finance");
  const industrials = profiles.find((profile) => profile.sector === "Industrials");
  assert.ok(technology && (technology.uniqueMedianPe ?? 0) > 35 && (technology.uniqueMedianPe ?? 0) < 50);
  assert.ok(technology && (technology.uniqueUpperQuartilePe ?? 0) > 70);
  assert.ok(finance && (finance.uniqueMedianPe ?? 0) > 20 && (finance.uniqueMedianPe ?? 0) < 40);
  assert.ok(industrials && industrials.medianPe > 30);
  const memory = businessProfiles.find((profile) => profile.group === "memory-cycle");
  const aiSemis = businessProfiles.find((profile) => profile.group === "ai-semiconductor");
  const ev = businessProfiles.find((profile) => profile.group === "ev-optionality");
  assert.ok(memory && memory.uniqueSampleSize >= 2 && memory.medianPe > 100);
  assert.ok(memory && memory.uniqueMedianPe > 0 && memory.uniqueUpperQuartilePe <= memory.p95Pe);
  assert.ok(aiSemis && aiSemis.uniqueSampleSize >= 4 && aiSemis.medianPe > 40);
  assert.ok(aiSemis && aiSemis.uniqueMedianPe > 0 && aiSemis.uniqueP95Pe > aiSemis.uniqueMedianPe);
  assert.ok(ev && ev.tickers.includes("TSLA") && ev.medianPe > 200);
  assert.equal(managerProfiles.length, 6);
  const citadel = managerProfiles.find((profile) => profile.fundName === "Citadel Advisors");
  const tci = managerProfiles.find((profile) => profile.fundName === "TCI Fund Management");
  assert.ok(citadel && citadel.uniqueSampleSize >= 10 && citadel.medianPe > 35 && citadel.medianPe < 55);
  assert.ok(tci && tci.uniqueSampleSize >= 7 && tci.upperQuartilePe < 45);
  assert.ok(managerProfiles.every((profile) => profile.medianFinancialAgeDays !== null));

  // Mature quality (AAPL) stays near the sector band, AI-cycle memory (MU)
  // receives the explicitly gated upper-tail market reference, and optionality
  // (TSLA) uses the wider tail. These references never rewrite intrinsic FV.
  assert.ok(aapl.stock.marketPricing?.selectedPe >= 30 && aapl.stock.marketPricing?.selectedPe < 42);
  assert.ok(mu.stock.marketPricing?.selectedPe >= 100 && mu.stock.marketPricing?.selectedPe <= 140);
  assert.ok(tsla.stock.marketPricing?.selectedPe >= 140 && tsla.stock.marketPricing?.selectedPe < 220);
  assert.equal(mu.stock.marketPricing?.referenceBusinessGroup, "memory-cycle");
  assert.ok((mu.stock.marketPricing?.referenceUniqueSampleSize ?? 0) >= 2);
  assert.equal(nvda.stock.marketPricing?.referenceBusinessGroup, undefined);
  assert.ok((nvda.stock.marketPricing?.selectedPe ?? Infinity) < 55);
  assert.ok(aapl.stock.fairValue < aapl.input.price);
  assert.ok(mu.stock.marketPricing?.fairValue > mu.input.price);
  assert.ok(tsla.stock.fairValue < tsla.input.price);
  assert.ok(googl.stock.marketPricing?.fairValue > googl.input.price);
  assert.equal(
    mu.stock.fairValue,
    calculateStock({ ...mu.input, fundPortfolioPe: undefined, fundSectorPe: undefined, institutionalSignal: undefined }).fairValue,
  );
  assert.ok(msft.stock.marketPricing?.fairValue < msft.input.price);
  assert.equal(mu.stock.marketPricing?.referenceSector, "Technology");
});
