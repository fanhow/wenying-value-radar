import assert from "node:assert/strict";
import test from "node:test";
import {
  DAILY_PRICE_CRON,
  QUARTERLY_FINANCIAL_CRON,
  runSnapshotJob,
  snapshotKindForCron,
} from "../lib/snapshot-scheduler.ts";

function fakeDatabase() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        bind(...args) {
          calls.push({ sql, args });
          return statement;
        },
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
        first: async () => null,
      };
      return statement;
    },
    batch: async (statements) => {
      calls.push({ batch: statements.length });
      return { success: true };
    },
  };
}

test("maps the daily and quarterly cron expressions to the intended jobs", () => {
  assert.equal(snapshotKindForCron(DAILY_PRICE_CRON), "daily-price");
  assert.equal(snapshotKindForCron(QUARTERLY_FINANCIAL_CRON), "quarterly-financial");
  assert.equal(snapshotKindForCron("unexpected"), "daily-price");
});

test("persists a quarterly valuation payload without requiring a browser refresh", async () => {
  const database = fakeDatabase();
  const result = await runSnapshotJob("quarterly-financial", {
    database,
    now: new Date("2026-08-11T00:00:00.000Z"),
    valuations: [{
      ticker: "MU",
      market: "US",
      price: 868.3,
      financialDataDate: "2026-05-28",
      updatedAt: "2026-08-11",
    }],
  });

  assert.deepEqual(result, {
    kind: "quarterly-financial",
    status: "succeeded",
    priceCount: 0,
    financialCount: 1,
  });
  assert.ok(database.calls.some((call) => String(call.sql ?? "").includes("financial_snapshots")));
  assert.ok(database.calls.some((call) => String(call.sql ?? "").includes("snapshot_runs")));
});

test("does not fail local previews when D1 is not configured", async () => {
  const result = await runSnapshotJob("quarterly-financial", {
    now: new Date("2026-08-11T00:00:00.000Z"),
    valuations: [{ ticker: "AAPL", market: "US", price: 308.9 }],
  });
  assert.deepEqual(result, {
    kind: "quarterly-financial",
    status: "succeeded",
    priceCount: 0,
    financialCount: 0,
  });
});

test("keeps a partial daily price run when one public source is unavailable", async () => {
  const database = fakeDatabase();
  const fetcher = async (url) => {
    if (url.includes("tpex.org.tw")) {
      return { ok: false, status: 403, json: async () => [] };
    }
    if (url.includes("twse.com.tw")) {
      return { ok: true, status: 200, json: async () => [{ Code: "2330", Name: "TSMC", ClosingPrice: "100", Date: "2026-08-11" }] };
    }
    return { ok: true, status: 200, json: async () => ({ data: { rows: [{ symbol: "AAPL", name: "Apple Inc.", lastsale: "$300" }] } }) };
  };
  const result = await runSnapshotJob("daily-price", { database, fetcher });
  assert.equal(result.status, "partial");
  assert.equal(result.priceCount, 2);
});

test("maps each public source's volume field into price snapshots", async () => {
  const database = fakeDatabase();
  const fetcher = async (url) => {
    if (url.includes("tpex.org.tw")) {
      return { ok: true, status: 200, json: async () => [{ SecuritiesCompanyCode: "6488", CompanyName: "GlobalWafers", Close: "500", TradingShares: "1,234" }] };
    }
    if (url.includes("twse.com.tw")) {
      return { ok: true, status: 200, json: async () => [{ Code: "2330", Name: "TSMC", ClosingPrice: "100", TradeVolume: "2,345" }] };
    }
    return { ok: true, status: 200, json: async () => ({ data: { rows: [{ symbol: "AAPL", name: "Apple Inc.", lastsale: "$300", volume: "3,456" }] } }) };
  };

  const result = await runSnapshotJob("daily-price", { database, fetcher });
  const priceWrites = database.calls.filter((call) => String(call.sql ?? "").includes("INSERT INTO market_price_snapshots"));
  const volumeByTicker = new Map(priceWrites.map((call) => [call.args[1], call.args[5]]));

  assert.equal(result.status, "succeeded");
  assert.equal(result.priceCount, 3);
  assert.equal(volumeByTicker.get("2330"), 2345);
  assert.equal(volumeByTicker.get("6488"), 1234);
  assert.equal(volumeByTicker.get("AAPL"), 3456);
});
