import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const setupIds = [
  "false_break_reclaim",
  "flat_pullback",
  "first_pullback",
  "compression_expansion",
  "failed_m_top",
  "failed_w_bottom",
  "exhaustion_reversal",
  "lower_wick_adr",
  "morning_star_support",
  "mtop_break_retest",
];

test("setup library keeps bilingual navigation and About Us last", async () => {
  const header = await readFile(new URL("../app/site-header.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/setups/page.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../app/setups/setup-library.ts", import.meta.url), "utf8");

  assert.match(header, /href="\/setups"[\s\S]*href="\/about"/);
  assert.match(page, /中英文型態索引/);
  assert.match(page, /Bilingual setup index/);
  assert.match(page, /CHARLIE A\+ SETUP LIBRARY/);
  assert.match(page, /unoptimized/);
  for (const id of setupIds) {
    assert.match(data, new RegExp(`id: "${id}"`));
    for (const extension of ["png", "svg"]) {
      const file = new URL(`../public/setup-library/${id}.${extension}`, import.meta.url);
      assert.ok((await stat(file)).size > 10_000, `${id}.${extension} is missing or incomplete`);
    }
  }
});

test("renders the standalone setup library route", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("setups", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/setups", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /CHARLIE A\+ SETUP LIBRARY/);
  assert.match(html, /假跌破與收復/);
  assert.match(html, /False Break \+ Reclaim/);
  assert.match(html, /型態圖庫[\s\S]*關於我們/);
});
