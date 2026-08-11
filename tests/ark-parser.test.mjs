import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateArkCandidates, parseArkDocument } from "../lib/ark-parser.ts";
import { fallbackTaiwanSymbols, fallbackUsSymbols, findArkUsSnapshot } from "../lib/ark-directory.ts";

const twSymbols = new Map([
  ["2330", { name: "台積電", price: 2370 }],
  ["00911", { name: "兆豐洲際半導體", price: 30 }],
  ["00631L", { name: "元大台灣50正2", price: 400 }],
]);

const usSymbols = new Map([
  ["AMD", { cik_str: 2488, ticker: "AMD", title: "ADVANCED MICRO DEVICES INC" }],
  ["ALL", { cik_str: 899051, ticker: "ALL", title: "ALLSTATE CORP" }],
]);

test("recognizes four, five and alphanumeric Taiwan symbols", () => {
  const rows = parseArkDocument(
    { fileName: "ark.png", text: "2330 台積電 2370\n00911 兆豐洲際半導體 30.1 30.2\n00631L 元大台灣50正2 401 399" },
    twSymbols,
    usSymbols,
  );
  assert.deepEqual(rows.map((row) => row.ticker), ["2330", "00911", "00631L"]);
  assert.equal(rows[1].capturedNav, 30.2);
});

test("rejects ordinary English words that happen to be SEC tickers", () => {
  const rows = parseArkDocument(
    { fileName: "ark.png", text: "SHOW ALL 123 RESULTS" },
    twSymbols,
    usSymbols,
  );
  assert.deepEqual(rows, []);
});

test("recognizes a US ticker anchored in a quote row", () => {
  const rows = parseArkDocument(
    { fileName: "ark.png", text: "AMD ADVANCED MICRO DEVICES 172.50" },
    twSymbols,
    usSymbols,
  );
  assert.equal(rows[0].ticker, "AMD");
  assert.equal(rows[0].capturedPrice, 172.5);
});

test("keeps the richest values when duplicate screenshots contain one ticker", () => {
  const rows = deduplicateArkCandidates([
    { id: "a", ticker: "00911", market: "TW", fileName: "a.png", capturedPrice: 30 },
    { id: "b", ticker: "00911", market: "TW", fileName: "b.png", capturedNav: 30.2 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].capturedPrice, 30);
  assert.equal(rows[0].capturedNav, 30.2);
});

test("recognizes all Taiwan ETF rows from the supplied ARKER screenshot", () => {
  const rows = parseArkDocument({
    fileName: "ark-etf.png",
    text: [
      "元大全球5G 89.25 89.58", "00876", "1.25 1.42 0.37",
      "國泰費城半導體 88.45 88.24", "00830", "2.1 2.43 0.24",
      "元大台灣50正2 34.7 34.65", "00631L", "1.02 3.03 0.14",
      "國泰網路資安 56.15 55.85", "00875", "0.5 0.90 0.54",
      "富邦科技 60.95 60.93", "0052", "0.75 1.25 0.03",
      "元大台灣50 104.25 104.12", "0050", "1.4 1.36 0.12",
      "元大電子 237 235.97", "0053", "5.25 2.27 0.44",
      "富邦摩台 311.15 311.27", "0057", "5 1.63 0.04",
    ].join("\n"),
  }, fallbackTaiwanSymbols(), fallbackUsSymbols());

  assert.deepEqual(rows.map((row) => row.ticker), ["00876", "00830", "00631L", "00875", "0052", "0050", "0053", "0057"]);
  assert.equal(rows[0].capturedPrice, 89.25);
  assert.equal(rows[0].capturedNav, 89.58);
});

test("recognizes all US rows from the supplied ARKER screenshot", () => {
  const rows = parseArkDocument({
    fileName: "ark-us.png",
    text: [
      "超微半導體 469.56", "AMD 13.8 (2.86%)",
      "美光科技 861", "MU 16.57 (1.89%)",
      "應用材料 522.12", "AMAT 17.02 (3.16%)",
      "英特爾 97.52", "INTC 4.13 (4.06%)",
      "思科 122.57", "CSCO 1.14 (0.94%)",
      "台積電 ADR 418.47", "TSM 1.57 (0.37%)",
      "輝達 217.55", "NVDA 6.41 (2.86%)",
      "PALO ALTO NETWORKS 385.04", "PANW 21.18 (5.82%)",
    ].join("\n"),
  }, fallbackTaiwanSymbols(), fallbackUsSymbols());

  assert.deepEqual(rows.map((row) => row.ticker), ["AMD", "MU", "AMAT", "INTC", "CSCO", "TSM", "NVDA", "PANW"]);
  assert.equal(rows[5].capturedPrice, 418.47);
  assert.ok(findArkUsSnapshot("TSM"));
});
