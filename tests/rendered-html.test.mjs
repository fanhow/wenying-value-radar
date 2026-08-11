import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /穩盈 - 價值雷達/);
  assert.match(html, /關於我們/);
  assert.match(html, /大戶追蹤/);
  assert.match(html, /語言選擇/);
  assert.match(html, /MARKET SCAN \/ 04/);
  assert.doesNotMatch(html, /我們不是賭徒/);
  assert.match(html, /方舟運算/);
  assert.doesNotMatch(html, /選擇方舟 App 截圖/);
  assert.match(html, /每個納入模型採等權/);
  assert.match(html, /不參考目前股價的 robust filter/);
  assert.match(html, /估值只使用公開 LTM、年度財報與市場比率/);
});

test("valuation details expose the bilingual model audit trail", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /模型平均公允價值/);
  assert.match(source, /Model Average Fair Value/);
  assert.match(source, /等權適用模型/);
  assert.match(source, /Equal-weight applicable models/);
  assert.match(source, /資料基礎/);
  assert.match(source, /Data Basis/);
  assert.match(source, /排除模型/);
  assert.match(source, /Excluded Models/);
  assert.match(source, /結構性趨勢/);
  assert.match(source, /Structural Themes/);
  assert.match(source, /只影響 DCF 起始成長率/);
  assert.match(source, /按月檢視/);
  assert.match(source, /price-independent robust outlier filter/);
  assert.match(source, /key=\{model\.id \|\| model\.label\}/);
  assert.match(source, /width <= 0\) return 50/);
  assert.match(source, /model\.rangeLow/);
  assert.match(source, /model\.rangeHigh/);
});

test("renders the standalone ARKER import page in Chinese by default", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("ark", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/ark", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /把方舟名單/);
  assert.match(html, /選擇方舟 App 截圖/);
  assert.match(html, /內建名錄與財務快照/);
});

test("renders the About Us page in Chinese by default", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("about", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/about", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /認識穩盈/);
  assert.match(html, /我們不是賭徒/);
});

test("renders the fund tracker page in Chinese by default", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("funds", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/funds", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /追蹤最會賺錢的資金/);
  assert.match(html, /Citadel Advisors/);
  assert.match(html, /TCI Fund Management/);
  assert.match(html, /SEC 13F/);
});
