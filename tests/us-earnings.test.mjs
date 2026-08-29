import test from "node:test";
import assert from "node:assert/strict";
import { loadUsEarningsReport } from "../lib/us-earnings.ts";

const offlineFetcher = () => Promise.reject(new Error("Deterministic offline test"));

test("loadUsEarningsReport correctly parses the curated NVDA after-hours snapshot", async () => {
  const report = await loadUsEarningsReport("NVDA", offlineFetcher);
  assert.ok(report, "NVDA earnings report should exist");
  assert.equal(report.ticker, "NVDA");
  assert.equal(report.earningsDate, "2026-08-26");
  assert.equal(report.isDateConfirmed, true);
  assert.equal(report.earningsTime, "after-hours");
  assert.equal(report.urgencyLevel, "imminent");
  assert.equal(report.countdownDays, 0);
  assert.equal(report.consensusEps, 2.09);
  assert.equal(report.lastYearEps, 0.99);
  assert.equal(report.beatRatePercent, 100);
  assert.match(report.alertTitleZh, /重大財報日提醒/);
  assert.match(report.alertTitleZh, /今日/);
  assert.match(report.alertTitleEn, /TODAY/);
  assert.ok(report.upcomingQuarters.length >= 1, "Should contain upcoming quarter projections");
  assert.ok(report.fiscalYearForecast.length >= 1, "Should contain fiscal year projections");
});

test("loadUsEarningsReport correctly classifies countdown for AVGO", async () => {
  const report = await loadUsEarningsReport("AVGO", offlineFetcher);
  assert.ok(report, "AVGO earnings report should exist");
  assert.equal(report.ticker, "AVGO");
  assert.equal(report.urgencyLevel, "imminent");
  assert.ok(report.countdownDays !== null && report.countdownDays <= 7);
  assert.equal(report.consensusEps, 2.83);
  assert.match(report.alertTitleZh, /財報倒數提醒/);
});

test("loadUsEarningsReport handles scheduled earnings for AAPL and TSLA", async () => {
  const aapl = await loadUsEarningsReport("AAPL", offlineFetcher);
  assert.ok(aapl);
  assert.equal(aapl.ticker, "AAPL");
  assert.ok(aapl.consensusEps !== null && aapl.consensusEps > 0);
  assert.ok(aapl.urgencyLevel === "scheduled" || aapl.urgencyLevel === "estimated");

  const tsla = await loadUsEarningsReport("TSLA", offlineFetcher);
  assert.ok(tsla);
  assert.equal(tsla.ticker, "TSLA");
  assert.ok(tsla.consensusEps !== null);
});

test("loadUsEarningsReport returns null for Taiwan stock tickers or invalid formats", async () => {
  const twStock = await loadUsEarningsReport("2330");
  assert.equal(twStock, null);

  const empty = await loadUsEarningsReport("");
  assert.equal(empty, null);
});

test("loadUsEarningsReport falls back reliably when network is unreachable", async () => {
  const failingFetcher = () => Promise.reject(new Error("Network offline"));
  const report = await loadUsEarningsReport("NVDA", failingFetcher);
  assert.ok(report, "Should return curated fallback snapshot");
  assert.equal(report.ticker, "NVDA");
  assert.equal(report.consensusEps, 2.09);
  assert.equal(report.countdownDays, 0);
});
