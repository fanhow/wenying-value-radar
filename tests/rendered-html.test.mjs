import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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
  assert.match(html, /市場情緒/);
  assert.match(html, /市場情緒[\s\S]*關於我們/);
  assert.match(html, /大戶追蹤/);
  assert.match(html, /語言選擇/);
  assert.match(html, /MARKET SCAN \/ 02/);
  assert.match(source, /VALUATION \/ 01/);
  assert.match(source, /MY WATCHLIST \/ 03/);
  assert.match(source, /ticker: firstCandidate\.ticker, market: firstCandidate\.market, refresh: true/);
  assert.doesNotMatch(html, /我們不是賭徒/);
  assert.match(html, /方舟運算/);
  assert.doesNotMatch(html, /選擇方舟 App 截圖/);
  assert.doesNotMatch(html, /href="\/#method"/);
  assert.doesNotMatch(html, /HOW IT WORKS/);
  assert.match(html, /Rev\. 2026\.08\.15\.3/);
  assert.match(source, /className="watch-remove"/);
  assert.match(source, /valuationDirectionSymbol\(direction\)[\s\S]*formatSignedPercent\(stock\.upside\)/);
});

test("keeps the local preview working when Cloudflare env bindings are absent", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("no-env", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    undefined,
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  assert.match(await response.text(), /MARKET SCAN \/ 02/);
});

test("valuation details expose the bilingual model audit trail", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const fundsSource = await readFile(new URL("../app/funds/page.tsx", import.meta.url), "utf8");

  assert.match(source, /模型中心公允價值/);
  assert.match(source, /Model Center Fair Value/);
  assert.match(source, /模型家族平衡 · 家族內等權、家族間等權/);
  assert.match(source, /Family-balanced · equal within and across families/);
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
  assert.match(source, /reference range \$\{formatMultiple\(stock\.marketPricing\?\.peLow\)\}/);
  assert.match(source, /同產業樣本品質/);
  assert.match(source, /comparablePePeerCount/);
  assert.match(source, /Usable peers by model/);
  assert.match(fundsSource, /profile\.uniqueSampleSize/);
assert.match(fundsSource, /fundPortfolioOverlapProfiles/);
assert.match(fundsSource, /CROWDING SIGNAL \/ 02/);
assert.match(fundsSource, /stockDetailHref\(profile\.ticker\)/);
assert.match(fundsSource, /fundManagerPeProfiles/);
assert.match(fundsSource, /MANAGER SNAPSHOT \/ 04/);
assert.match(fundsSource, /P25–P75/);
assert.match(fundsSource, /不是基金預測的合理本益比/);
  assert.match(source, /onClick=\{\(\) => openRankedStock\(stock\.ticker\)\}/);
  assert.match(source, /onKeyDown=/);
});

test("renders the standalone ARKER import page in Chinese by default", async () => {
  const source = await readFile(new URL("../app/ark/page.tsx", import.meta.url), "utf8");
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
  assert.match(html, /方舟運算長期紀錄/);
  assert.match(html, /每次匯入會保存/);
  assert.match(source, /groupArkLogRowsByDay/);
  assert.match(source, /<details className="ark-log-batch"/);
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

test("renders the market sentiment page with source-backed flow snapshots", async () => {
  const source = await readFile(new URL("../app/sentiment/page.tsx", import.meta.url), "utf8");
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("sentiment", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/sentiment", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /隱含波動率與持倉風險/);
  assert.match(html, /影片圖表的原始來源/);
  assert.match(html, /BofA THE FLOW SHOW/);
  assert.match(html, /CITADEL SECURITIES GMI/);
  assert.doesNotMatch(source, /youtube\.com\/watch\?v=ebV7mgXEJ6g&t=508s/);
  assert.match(source, /market-direction-mark/);
  assert.match(source, /august-after-the-reset/);
});
