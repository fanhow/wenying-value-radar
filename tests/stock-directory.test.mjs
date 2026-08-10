import assert from "node:assert/strict";
import test from "node:test";
import { findStockDirectoryEntries, rankMarketSymbols, safeLookupError } from "../lib/stock-directory.ts";

test("suggests Apple before a valuation has been loaded", () => {
  assert.deepEqual(findStockDirectoryEntries("AAPL").map(({ ticker, nameEn }) => ({ ticker, nameEn })), [
    { ticker: "AAPL", nameEn: "Apple" },
  ]);
});

test("resolves 2330 to the Taiwan Semiconductor display name", () => {
  assert.equal(findStockDirectoryEntries("2330")[0]?.nameZh, "台積電");
});

test("does not expose upstream redirect URLs to users", () => {
  const message = safeLookupError("Too many redirects https://example.com/errors", "zh");
  assert.equal(message, "公開資料暫時無法連線，請稍後再試。");
  assert.doesNotMatch(message, /https?:\/\//);
});

test("ranks arbitrary TWSE and TPEx ticker matches", () => {
  const symbols = [
    { ticker: "6994", name: "富威電力", market: "TW" },
    { ticker: "3508", name: "位速", market: "TW" },
  ];
  assert.equal(rankMarketSymbols(symbols, "3508")[0]?.name, "位速");
  assert.equal(rankMarketSymbols(symbols, "6994")[0]?.name, "富威電力");
});
