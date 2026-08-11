import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { institutionalSignalForTicker } from "../lib/fund-signal.ts";

const snapshotUrl = new URL("../lib/fund-holdings-snapshot.json", import.meta.url);
const snapshot = JSON.parse(await readFile(snapshotUrl, "utf8"));

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
