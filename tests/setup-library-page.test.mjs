import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  const card = await readFile(new URL("../app/setups/setup-library-card.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../app/setups/setup-library.ts", import.meta.url), "utf8");

  assert.match(header, /href="\/setups"[\s\S]*href="\/about"/);
  assert.match(page, /中英文型態索引/);
  assert.match(page, /Bilingual setup index/);
  assert.match(page, /CHARLIE A\+ SETUP LIBRARY/);
  assert.match(card, /unoptimized/);
  for (const id of setupIds) {
    assert.match(data, new RegExp(`id: "${id}"`));
    for (const extension of ["png", "svg"]) {
      const file = new URL(`../public/setup-library/${id}.${extension}`, import.meta.url);
      assert.ok((await stat(file)).size > 10_000, `${id}.${extension} is missing or incomplete`);
    }
  }
});

test("keeps the approved Phase 1 Setup 05 ideal model unchanged", async () => {
  const data = await readFile(new URL("../app/setups/setup-library.ts", import.meta.url), "utf8");
  const png = await readFile(new URL("../public/setup-library/failed_m_top.png", import.meta.url));
  const svg = await readFile(new URL("../public/setup-library/failed_m_top.svg", import.meta.url));

  assert.match(data, /十字星收盤即時發出警示/);
  assert.match(data, /次日開盤若向上跳空/);
  assert.match(data, /不等待收復頸線/);
  assert.match(data, /Do not wait for neckline reclaim/);
  assert.equal(createHash("sha256").update(png).digest("hex"), "b3f3e14702649e53db9b8e0516ba29e6bf678e5519df5904c1c5a2f5fb2eb9d3");
  assert.equal(createHash("sha256").update(svg).digest("hex"), "1530e2699224a62e02d309ec47e4b24213422ccb838acb352adb797703b96bb6");
});

test("real-market case files parse without invented numeric fields", async () => {
  for (const fileName of ["usd_jpy_lower_wick_adr.json", "avgo_reversal.json"]) {
    const parsed = JSON.parse(await readFile(new URL(`../data/real_cases/${fileName}`, import.meta.url), "utf8"));
    assert.ok(parsed.id);
    assert.ok(parsed.setup_id);
    assert.ok(["long", "short"].includes(parsed.direction));
    for (const value of [
      parsed.entry.price,
      parsed.entry.candle_index,
      parsed.initial_stop.price,
      parsed.exit.price,
      parsed.adr.completed_at_entry_percent,
      parsed.performance.result_percent,
      parsed.performance.result_r,
    ]) {
      assert.ok(value === null || (typeof value === "number" && Number.isFinite(value)));
    }
  }

  const avgo = JSON.parse(await readFile(new URL("../data/real_cases/avgo_reversal.json", import.meta.url), "utf8"));
  assert.equal(avgo.entry.price, null);
  assert.equal(avgo.performance.result_r, null);
  assert.match(avgo.outcome_summary.zh, /已知獲利/);
});

test("real-market case helpers support zero, one, and multiple cases safely", async () => {
  const moduleUrl = new URL("../app/setups/real-market-cases.ts", import.meta.url);
  moduleUrl.searchParams.set("case-data", `${process.pid}-${Date.now()}`);
  const cases = await import(moduleUrl.href);

  assert.equal(cases.realCasesForSetup("not_registered").length, 0);
  assert.equal(cases.realCasesForSetup("failed_m_top").length, 1);
  const first = cases.REAL_MARKET_CASES[0];
  assert.equal(cases.realCasesForSetup(first.setup_id, [first, { ...first, id: `${first.id}_copy` }]).length, 2);
  assert.equal(cases.formatNullableMetric(null), "—");
  assert.equal(cases.formatNullableMetric(1.25, "R", 2), "1.25R");
});

test("annotation files are separate, editable, and enforce normalized coordinates", async () => {
  const moduleUrl = new URL("../app/setups/real-market-cases.ts", import.meta.url);
  moduleUrl.searchParams.set("annotations", `${process.pid}-${Date.now()}`);
  const { REAL_CASE_ANNOTATIONS, validateAnnotationBundle } = await import(moduleUrl.href);
  assert.equal(Object.keys(REAL_CASE_ANNOTATIONS).length, 2);

  const valid = {
    case_id: "fixture",
    source_image: null,
    image_width: null,
    image_height: null,
    annotations: [{ id: "support", kind: "Support", label: { zh: "支撐", en: "Support" }, x: 0, y: 1, x2: null, y2: null }],
  };
  assert.doesNotThrow(() => validateAnnotationBundle(valid));
  assert.throws(() => validateAnnotationBundle({ ...valid, annotations: [{ ...valid.annotations[0], x: 1.01 }] }), /between 0 and 1/);
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
  assert.match(html, /理想模型/);
  assert.match(html, /真實市場案例/);
  assert.match(html, /USDJPY/);
  assert.match(html, /AVGO/);
  assert.match(html, /原始交易截圖尚未附上/);
  assert.match(html, /目前資料不足/);
  assert.match(html, /型態圖庫[\s\S]*關於我們/);
});
