import assert from "node:assert/strict";
import test from "node:test";
import { readValuationQueryCache, saveValuationQueryCache } from "../lib/valuation-cache.ts";

function fakeDatabase() {
  const rows = new Map();
  return {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async run() {
          if (sql.includes("INSERT INTO valuation_query_cache")) {
            rows.set(`${args[0]}:${args[1]}`, { payload: args[2], cachedAt: args[3], expiresAt: args[4] });
          }
          return {};
        },
        async first() { return rows.get(`${args[0]}:${args[1]}`) ?? null; },
      };
    },
  };
}

const stock = {
  ticker: "2324", name: "仁寶", market: "TW", sector: "台灣上市公司", price: 35,
  eps: 3, bvps: 25, fcfPerShare: 2, targetPe: 12, targetPb: 1.5,
  targetFcfMultiple: 12, revenueGrowth: 5, roe: 12, debtRatio: 50, uncertainty: 0.25,
};

test("persists and reuses a fresh D1 valuation query cache", async () => {
  const database = fakeDatabase();
  const now = new Date("2026-08-12T01:00:00.000Z");
  assert.equal(await saveValuationQueryCache(stock, now, database), true);
  assert.deepEqual(await readValuationQueryCache("TW", "2324", new Date("2026-08-12T02:00:00.000Z"), database), stock);
});

test("does not serve an expired D1 valuation query cache", async () => {
  const database = fakeDatabase();
  const now = new Date("2026-08-12T01:00:00.000Z");
  await saveValuationQueryCache(stock, now, database);
  assert.equal(await readValuationQueryCache("TW", "2324", new Date("2026-08-12T03:01:00.000Z"), database), null);
});
