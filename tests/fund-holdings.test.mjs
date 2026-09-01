import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const snapshotUrl = new URL("../lib/fund-holdings-snapshot.json", import.meta.url);
const snapshot = JSON.parse(await readFile(snapshotUrl, "utf8"));

test("tracks the top six managers in ranking order", () => {
  assert.equal(snapshot.funds.length, 6);
  assert.deepEqual(snapshot.funds.map((fund) => fund.rank), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(snapshot.funds.map((fund) => fund.name), [
    "Citadel Advisors",
    "D. E. Shaw",
    "Bridgewater Associates",
    "Millennium Management",
    "TCI Fund Management",
    "Elliott Investment Management",
  ]);
});

test("compares two complete 13F quarters and retains usable holdings", () => {
  for (const fund of snapshot.funds) {
    assert.equal(fund.reportDate, "2026-06-30");
    assert.equal(fund.previousReportDate, "2026-03-31");
    assert.ok(fund.holdings.length >= 8);
    assert.ok(fund.holdings.every((holding) => /^[A-Z][A-Z0-9.-]*$/.test(holding.ticker)));
    assert.ok(fund.holdings.some((holding) => holding.significantChange));
  }
});

test("marks large additions and reductions for red emphasis", () => {
  const changes = snapshot.funds.flatMap((fund) => fund.holdings).filter((holding) => holding.significantChange);
  assert.ok(changes.some((holding) => holding.changeType === "new"));
  assert.ok(changes.some((holding) => holding.changeType === "increased"));
  assert.ok(changes.some((holding) => holding.changeType === "reduced"));
  assert.ok(changes.every((holding) => holding.changeType === "new" || Math.abs(holding.changePercent) >= 10));
});
