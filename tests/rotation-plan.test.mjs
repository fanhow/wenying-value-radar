import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRotationPlan, parseRotationTickers } from "../lib/rotation-plan.ts";
import { ROTATION_PROFILES } from "../lib/rotation-research.ts";

// Synthetic symbols solely for unit tests, never shipped as suggested holdings.
const basket = Array.from({ length: 15 }, (_, index) => String(2000 + index));
const valid = (override = {}) => ({
  profileId: "taiwan-chip-champions", period: "2026-09", previous: basket.join(","),
  proposed: [...basket.slice(1), "2999"].join("\n"), initialBasket: false,
  membershipConfirmed: true, scheduleConfirmed: true,
  sourceObservedAt: "2026-09-01T15:00:00+08:00", preparedAt: "2026-09-15T00:00:00Z",
  ...override,
});

test("catalogue distinguishes four TW and twelve US strategies and quarterly exceptions", () => {
  assert.equal(ROTATION_PROFILES.filter((row) => row.market === "TW").length, 4);
  assert.equal(ROTATION_PROFILES.filter((row) => row.market === "US").length, 12);
  assert.equal(new Set(ROTATION_PROFILES.map((row) => row.id)).size, 16);
  assert.deepEqual(ROTATION_PROFILES.filter((row) => row.frequency === "quarterly").map((row) => row.id), ["best-of-buffett", "dividend-us"]);
  assert.equal(ROTATION_PROFILES.filter((row) => row.verification === "detail").length, 5);
  assert.match(ROTATION_PROFILES.find(row=>row.id==='top-value-stocks').universe,/15.*35.*矛盾/);
});

test("complete baskets produce equal targets without pretending to execute orders", () => {
  const { plan, errors } = buildRotationPlan(valid());
  assert.deepEqual(errors, []);
  assert.equal(plan.status, "review-only");
  assert.equal(plan.added, 1); assert.equal(plan.removed, 1); assert.equal(plan.retained, 14);
  assert.equal(plan.rows.find((row) => row.ticker === "2000").targetWeight, 0);
  assert.ok(Math.abs(plan.rows.reduce((sum, row) => sum + row.targetWeight, 0) - 1) < 1e-12);
  assert.equal("entryPrice" in plan, false);
  assert.equal("expectedReturn" in plan, false);
});

test("reordering a basket is not an AI rank or a membership change", () => {
  const { plan } = buildRotationPlan(valid({ proposed: [...basket].reverse().join(",") }));
  assert.equal(plan.added, 0); assert.equal(plan.removed, 0); assert.equal(plan.retained, 15);
});

test("empty or incomplete current baskets cannot create sell-all or concentrated targets", () => {
  for (const proposed of ["", basket.slice(1).join(","), [...basket, "2999"].join(",")]) {
    const result = buildRotationPlan(valid({ proposed }));
    assert.equal(result.plan, null); assert.ok(result.errors.length);
  }
});

test("missing previous basket requires an explicit initial-basket decision", () => {
  assert.equal(buildRotationPlan(valid({ previous: "" })).plan, null);
  assert.equal(buildRotationPlan(valid({ previous: "", initialBasket: true })).plan.added, 15);
  assert.equal(buildRotationPlan(valid({ initialBasket: true })).plan, null);
});

test("duplicate tickers block the entire comparison including TW suffix aliases", () => {
  assert.equal(buildRotationPlan(valid({ proposed: [...basket, "2000.TW"].join(",") })).plan, null);
  assert.deepEqual(parseRotationTickers("2330.TW，2454\n8069.TWO", "TW").tickers, ["2330", "2454", "8069"]);
  assert.equal(parseRotationTickers("brk.b,BRK.B", "US").errors.length, 1);
});

test("cross-market, HTML, ambiguous symbols and excessive input are rejected", () => {
  for (const text of ["AAPL", "0050", "<script>", "TWSE:2330", "2330/2454"]) assert.ok(parseRotationTickers(text, "TW").errors.length);
  assert.ok(parseRotationTickers("2330", "US").errors.length);
  assert.ok(parseRotationTickers("A".repeat(10001), "US").errors.length);
  assert.deepEqual(parseRotationTickers("BRK.B BF-B AAPL", "US").errors, []);
});

test("unknown profile and invalid periods fail closed", () => {
  assert.equal(buildRotationPlan(valid({ profileId: "__proto__" })).plan, null);
  for (const period of ["2026-13", "September", "2026-00", "2026-9"]) assert.equal(buildRotationPlan(valid({ period })).plan, null);
});

test("source cannot postdate decision, and timezone comparisons are absolute", () => {
  assert.equal(buildRotationPlan(valid({ sourceObservedAt: "2026-09-15T01:00:00Z" })).plan, null);
  assert.ok(buildRotationPlan(valid({ sourceObservedAt: "2026-09-15T07:59:59+08:00" })).plan);
  assert.ok(buildRotationPlan(valid({ sourceObservedAt: "2026-09-15T08:00:00+08:00" })).plan);
});

test("invalid dates or timezone-free instants never generate a comparison", () => {
  for (const sourceObservedAt of ["", "2026-02-30T00:00:00Z", "2026-09-01T15:00:00", "bad"]) assert.equal(buildRotationPlan(valid({ sourceObservedAt })).plan, null);
});

test("future cycles and a source observation before the source cycle fail closed", () => {
  assert.equal(buildRotationPlan(valid({ period: "2026-10" })).plan, null);
  assert.equal(buildRotationPlan(valid({ sourceObservedAt: "2026-08-31T12:00:00Z" })).plan, null);
});

test("historical comparison is marked retrospective, not a point-in-time backtest", () => {
  const { plan } = buildRotationPlan(valid({ period: "2026-08" }));
  assert.equal(plan.retrospective, true);
  assert.equal(plan.status, "review-only");
});

test("market timezone determines cycle boundaries", () => {
  const symbols = Array.from({ length: 15 }, (_, index) => `TEST${index}`).join(",");
  assert.equal(buildRotationPlan(valid({ profileId: "tech-titans", proposed: symbols, previous: symbols, sourceObservedAt: "2026-09-01T00:00:00Z", preparedAt: "2026-09-01T00:30:00Z" })).plan, null);
});

test("quarterly schedule is never silently assumed to be monthly", () => {
  const symbols = Array.from({ length: 15 }, (_, index) => `TEST${index}`).join(",");
  assert.equal(buildRotationPlan(valid({ profileId: "best-of-buffett", proposed: symbols, previous: symbols, scheduleConfirmed: false })).plan, null);
});

test("human scope verification is mandatory rather than fabricated eligibility", () => {
  assert.equal(buildRotationPlan(valid({ membershipConfirmed: false })).plan, null);
});

test("rotation page retains source boundaries without a snapshot ranking dependency", async () => {
  const source = await readFile(new URL("../app/rotation/page.tsx", import.meta.url), "utf8");
  assert.match(source, /stockDetailHref\(row\.ticker\)/);
  assert.match(source, /key=\{profile\.id\}/);
  assert.match(source, /onChange=\{clearResult\}/);
  assert.match(source, /不宣稱複製未公開的 AI 模型/);
  assert.doesNotMatch(source, /market-scan-snapshot|localStorage|fetch\(/);
});

test("built Worker renders the new research route with all controls and sources", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("rotation", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/rotation", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const html = await response.text();
  assert.equal(response.status, 200);
  for (const text of ["量化輪動研究", "產生調倉檢查表", "不宣稱複製未公開的 AI 模型", "原頁名單更新期", "二十檔估值差異與獨立研究榜"]) assert.ok(html.includes(text));
  assert.match(html, /Rev\. 2026\.09\.21\.3/);
  assert.match(html, /propicks\/methodology/);
  assert.match(html, /taiwan-chip-champions/);
  assert.match(html, /value="dividend-us"/);
});
