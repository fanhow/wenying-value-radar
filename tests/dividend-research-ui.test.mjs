import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateStock } from '../lib/valuation.ts';

// Synthetic inputs exercise the calculation-to-rendering contract. They are
// neither issuer evidence nor an external valuation target; no requests occur.
const base = {
  ticker: 'DIVIDEND-UI', name: 'Synthetic Dividend UI Fixture', market: 'US',
  sector: 'Industrials', price: 100, eps: 5, bvps: 20, fcfPerShare: 4,
  targetPe: 20, targetPb: 2, targetFcfMultiple: 20,
  revenueGrowth: 3, roe: 20, debtRatio: 30, uncertainty: .2,
  dividendPerShare: 2, dataBasis: 'annual', financialDataDate: '2025-12-31',
  updatedAt: '2026-10-01',
};
const period = {
  currency: 'USD', periodBasis: 'annual',
  periodStart: '2025-01-01', periodEnd: '2025-12-31',
  shareBasis: 'ordinary-per-share',
};
const evidence = {
  ...period, kind: 'paid', paymentTiming: 'historical', ordinaryScope: 'ordinary-only',
  source: 'synthetic annual statement: ordinary cash dividends paid',
};
const earnings = {
  ...period, valuePerShare: 5, basis: 'reported-common',
  source: 'synthetic annual statement: earnings attributable to ordinary shareholders',
};
const assumptions = {
  growthRateAnnualDecimal: .02, costOfEquityAnnualDecimal: .1,
  dividendTiming: 'D0',
  growthSource: 'synthetic documented annual dividend growth assumption',
  costOfEquitySource: 'synthetic documented annual equity discount assumption',
  timingSource: 'synthetic documented historical D0 convention',
  sustainabilitySource: 'synthetic documented continuing ordinary dividend assumption',
};
const complete = (patch = {}) => ({
  ...base, dividendEvidence: evidence, dividendEarnings: earnings,
  ddmResearchAssumptions: assumptions, ...patch,
});

let directory, ExcludedModelRow;
test.before(async () => {
  directory = await mkdtemp(new URL('../.wrangler/dividend-ui-test-', import.meta.url));
  const output = path.join(directory, 'page.cjs');
  await build({
    entryPoints: [new URL('../app/page.tsx', import.meta.url).pathname], outfile: output,
    bundle: true, platform: 'node', format: 'cjs', packages: 'external',
    jsx: 'automatic', logLevel: 'silent',
  });
  ExcludedModelRow = createRequire(import.meta.url)(output).ExcludedModelRow;
  assert.equal(typeof ExcludedModelRow, 'function');
});
test.after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

function renderedDdm(input) {
  const stock = calculateStock(input);
  const model = stock.excludedModels.find(item => item.id === 'ddm-stable');
  assert.ok(model, 'the renderer must receive the actual excluded-model calculation');
  const html = Object.fromEntries(['zh', 'en'].map(language => [language,
    renderToStaticMarkup(React.createElement(ExcludedModelRow, { model, language })),
  ]));
  for (const language of ['zh', 'en']) {
    assert.match(html[language], /class="excluded-model-row"/);
    assert.ok(html[language].includes(language === 'zh'
      ? '穩定成長股利折現法' : 'Stable-Growth DDM'));
    assert.ok(html[language].includes(language === 'zh'
      ? '股利折現僅保留研究，不納入正式估值中心與排名。'
      : 'DDM remains research only and is excluded from the formal valuation center and ranking.'));
    assert.doesNotMatch(html[language], language === 'zh'
      ? /本質不適用|企業不適用|不適用股利折現法|成熟度不足/
      : /not appropriate|not suitable|not sustainable enough|maturity conditions/i);
  }
  return { stock, model, html };
}

test('missing dividend data renders a source gap rather than zero or intrinsic model inapplicability', () => {
  const { stock, model, html } = renderedDdm({ ...base, dividendPerShare: undefined });
  assert.equal(stock.ddmResearch.status, 'inputs-unavailable');
  assert.equal(stock.ddmResearch.dividendPerShare, null);
  assert.equal(model.reasonCode, 'DIVIDEND_AMOUNT_UNAVAILABLE');
  assert.equal(model.reasonCategory, 'source-data');
  assert.match(html.zh, /資料來源缺口/);
  assert.match(html.en, /Source data gaps/);
  assert.ok(html.zh.includes('尚未取得股利數值；缺值不代表零配息。'));
  assert.ok(html.en.includes('A dividend amount is unavailable. Missing data does not mean zero dividends.'));
  assert.doesNotMatch(html.zh, /來源記載該期間普通股利為零/);
  assert.doesNotMatch(html.en, /source reports zero ordinary dividends/);
});

test('an unverified zero or positive amount still discloses the missing declared/paid source basis', () => {
  for (const dividendPerShare of [0, 2]) {
    const { stock, model, html } = renderedDdm({ ...base, dividendPerShare });
    assert.equal(stock.ddmResearch.status, 'inputs-unavailable');
    assert.equal(stock.ddmResearch.dividendPerShare, dividendPerShare);
    assert.equal(model.reasonCode, 'DIVIDEND_SOURCE_BASIS_UNAVAILABLE');
    assert.equal(model.reasonCategory, 'source-data');
    assert.match(html.zh, /資料來源缺口/);
    assert.match(html.en, /Source data gaps/);
    assert.ok(html.zh.includes('股利尚未區分決議、實付或調整後口徑'));
    assert.ok(html.en.includes('The source does not distinguish declared, paid or adjusted dividends.'));
    assert.doesNotMatch(html.zh, /來源記載該期間普通股利為零/);
    assert.doesNotMatch(html.en, /source reports zero ordinary dividends/);
  }
});

test('a verified zero renders the observed-zero limitation without a missing-data label', () => {
  const { stock, model, html } = renderedDdm(complete({ dividendPerShare: 0 }));
  assert.equal(stock.ddmResearch.status, 'zero-dividend');
  assert.equal(stock.ddmResearch.dividendPerShare, 0);
  assert.equal(stock.ddmResearch.fairValue, null);
  assert.equal(model.reasonCode, 'OBSERVED_ZERO_DIVIDEND');
  assert.equal(model.reasonCategory, 'assumption');
  assert.match(html.zh, /模型與研究假設限制/);
  assert.match(html.en, /Model and research assumptions/);
  assert.ok(html.zh.includes('來源記載該期間普通股利為零；保留觀測零值'));
  assert.ok(html.en.includes('The source reports zero ordinary dividends for this period. Zero is retained'));
  assert.doesNotMatch(html.zh, /資料來源缺口|尚未取得股利數值|缺值不代表零配息/);
  assert.doesNotMatch(html.en, /Source data gaps|unavailable|Missing data does not mean zero/);
});

test('unmatched annual and LTM periods render a basis review and unavailable payout', () => {
  const { stock, model, html } = renderedDdm(complete({
    dividendEarnings: {
      ...earnings, periodBasis: 'ltm', periodStart: '2025-07-01', periodEnd: '2026-06-30',
    },
  }));
  assert.equal(stock.ddmResearch.status, 'basis-review');
  assert.equal(stock.ddmResearch.payoutRatio, null);
  assert.equal(stock.ddmResearch.fairValue, null);
  assert.equal(model.reasonCode, 'DIVIDEND_EARNINGS_BASIS_MISMATCH');
  assert.equal(model.reasonCategory, 'period-basis');
  assert.match(html.zh, /期間與每股口徑待覆核/);
  assert.match(html.en, /Period and per-share basis review/);
  assert.ok(html.zh.includes('股利與盈餘的期間、普通股每股基礎或正常化口徑不一致，配息率暫不計算。'));
  assert.ok(html.en.includes('Dividend and earnings periods, currency, per-share basis or normalization differ. The payout ratio is unavailable.'));
  assert.doesNotMatch(html.zh, /資料來源缺口/);
  assert.doesNotMatch(html.en, /Source data gaps/);
});

test('matched research inputs render the policy exclusion while the DDM value stays outside formal models', () => {
  const { stock, model, html } = renderedDdm(complete());
  assert.equal(stock.ddmResearch.status, 'research-ready');
  assert.ok(Math.abs(stock.ddmResearch.fairValue - 25.5) < 1e-10);
  assert.equal(stock.ddmResearch.includedInFormalValuation, false);
  assert.equal(stock.models.some(item => item.id === 'ddm-stable'), false);
  assert.equal(model.reasonCode, 'DDM_RESEARCH_ONLY');
  assert.equal(model.reasonCategory, 'policy');
  assert.match(html.zh, /研究用途限制/);
  assert.match(html.en, /Research scope limits/);
  assert.ok(html.zh.includes('股利研究輸入口徑已配對。'));
  assert.ok(html.en.includes('The dividend research inputs are matched.'));
  assert.doesNotMatch(html.zh, /資料來源缺口|模型與研究假設限制|尚未取得股利數值/);
  assert.doesNotMatch(html.en, /Source data gaps|Model and research assumptions|unavailable/);
});
