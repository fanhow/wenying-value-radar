import assert from "node:assert/strict";
import test from "node:test";
import { findStockDirectoryEntries, isTaiwanSymbolQuery, parseYahooTaiwanHtml, rankMarketSymbols, safeLookupError } from "../lib/stock-directory.ts";

test("suggests Apple before a valuation has been loaded", () => {
  assert.deepEqual(findStockDirectoryEntries("AAPL").map(({ ticker, nameEn }) => ({ ticker, nameEn })), [
    { ticker: "AAPL", nameEn: "Apple" },
  ]);
});

test("resolves 2330 to the Taiwan Semiconductor display name", () => {
  assert.equal(findStockDirectoryEntries("2330")[0]?.nameZh, "台積電");
});

test("resolves MediaTek by its Chinese company name", () => {
  assert.equal(findStockDirectoryEntries("聯發科")[0]?.ticker, "2454");
  assert.equal(findStockDirectoryEntries("聯發科技")[0]?.ticker, "2454");
});

test("resolves frequently searched Taiwan company names locally", () => {
  assert.equal(findStockDirectoryEntries("仁寶")[0]?.ticker, "2324");
  assert.equal(findStockDirectoryEntries("潤泰全")[0]?.ticker, "2915");
});

test("routes Chinese company names to the Taiwan symbol directory", () => {
  assert.equal(isTaiwanSymbolQuery("聯發科"), true);
  assert.equal(isTaiwanSymbolQuery("2454"), true);
  assert.equal(isTaiwanSymbolQuery("AAPL"), false);
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

test("parses a Taiwan stock fallback snapshot", () => {
  const html = '{"symbolName":"位速","regularMarketPrice":16.85,"incomesQ":[{"date":"2026-03-01T00:00:00+08:00","eps":"-0.10","bps":"4.76"},{"eps":"-0.38"},{"eps":"-0.22"},{"eps":"-0.51"}]}';
  assert.deepEqual(parseYahooTaiwanHtml(html), {
    name: "位速",
    price: 16.85,
    eps: -1.21,
    bvps: 4.76,
    updatedAt: "2026-03-01",
  });
});
