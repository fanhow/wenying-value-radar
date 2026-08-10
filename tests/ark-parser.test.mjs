import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateArkCandidates, parseArkDocument } from "../lib/ark-parser.ts";

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
