import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateStock, fadingGrowthDcfPerShare, fadingGrowthOperatingExitDcfPerShare } from '../lib/valuation.ts';

// Synthetic local calculation controls, never source-certified market data.
const base = {
  ticker: 'DCF-COST-TEST', name: 'DCF equity-cost source control', market: 'US',
  sector: 'Industrials', source: '手動輸入', price: 40, eps: 5, bvps: 0,
  fcfPerShare: 4, targetPe: 0, targetPb: 0, targetFcfMultiple: 0,
  revenueGrowth: 3, roe: 20, debtRatio: 30, debtPerShare: 0, cashPerShare: 0,
  uncertainty: .2, dataCompleteness: 'complete', dataBasis: 'ltm',
  updatedAt: '2026-10-03', financialDataDate: '2026-09-30',
  beta: 1, riskFreeRate: .04, marketRiskPremium: .05, countryRiskPremium: 0,
};
const cases = [
  { id: 'decimal input', patch: { discountRate: .1 }, ke: .1, explicit: true },
  { id: 'percentage input', patch: { discountRate: 10 }, ke: .1, explicit: true },
  { id: 'lower-clamped input', patch: { discountRate: .01 }, ke: .045, explicit: true },
  { id: 'upper-clamped input', patch: { discountRate: .5 }, ke: .25, explicit: true },
  { id: 'missing input', patch: { discountRate: undefined }, ke: .09, explicit: false },
  { id: 'NaN input', patch: { discountRate: NaN }, ke: .09, explicit: false },
  { id: 'Infinity input', patch: { discountRate: Infinity }, ke: .09, explicit: false },
  { id: 'negative Infinity input', patch: { discountRate: -Infinity }, ke: .09, explicit: false },
  { id: 'missing CAPM parameters', patch: {
    discountRate: undefined, beta: undefined, riskFreeRate: undefined,
    marketRiskPremium: undefined, countryRiskPremium: undefined,
  }, ke: .0425 + 1.05 * .0525, explicit: false },
];
const NativeDate = globalThis.Date;
const nativeFetch = globalThis.fetch;
const frozenMs = NativeDate.parse('2026-10-03T23:40:00.000Z');
let directory, explanation, ExcludedModelRow, uiFormatNumber, networkAttempts = 0;

test.before(async () => {
  globalThis.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [frozenMs])); }
    static now() { return frozenMs; }
  };
  globalThis.fetch = async () => { networkAttempts++; throw new Error('Offline DCF regression rejects fetch'); };
  directory = await mkdtemp(new URL('../.wrangler/dcf-label-test-', import.meta.url));
  const output = path.join(directory, 'page.cjs');
  const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  // Expose the exact private controller used by the included model rows only
  // inside this temporary bundle. The application source is never edited.
  await build({ stdin: {
    contents: source + '\nexport { localizedModelExplanation as dcfTestExplanation, formatNumber as dcfTestFormatNumber };\n',
    resolveDir: new URL('../app/', import.meta.url).pathname,
    sourcefile: 'page.tsx', loader: 'tsx',
  }, outfile: output, bundle: true, platform: 'node', format: 'cjs',
  packages: 'external', jsx: 'automatic', logLevel: 'silent' });
  const page = createRequire(import.meta.url)(output);
  explanation = page.dcfTestExplanation;
  ExcludedModelRow = page.ExcludedModelRow;
  uiFormatNumber = page.dcfTestFormatNumber;
  assert.equal(typeof explanation, 'function');
  assert.equal(typeof ExcludedModelRow, 'function');
  assert.equal(typeof uiFormatNumber, 'function');
});
test.after(async () => {
  globalThis.Date = NativeDate;
  globalThis.fetch = nativeFetch;
  if (directory) await rm(directory, { recursive: true, force: true });
  assert.equal(networkAttempts, 0, 'the local calculation and render must not fetch');
});

function close(actual, expected, label) {
  assert.ok(Number.isFinite(actual), label + ': finite result required');
  assert.ok(Math.abs(actual - expected) < 1e-10,
    label + ': expected ' + expected + ', received ' + actual);
}
function dcf(stock, years) {
  const model = stock.models.find(item => item.id === `dcf-fcf-${years}y`);
  assert.ok(model, 'controlled positive-FCF fixture must retain ' + years + '-year DCF');
  return model;
}

for (const item of cases) {
  test(item.id + ' retains the existing actual equity cost and FCF DCF denominator', () => {
    const stock = calculateStock({ ...base, ...item.patch });
    close(stock.assumptions.costOfEquity, item.ke, 'actual cost of equity');
    close(stock.discountRate, item.ke, 'calculated Stock.discountRate is the effective rate');
    for (const years of [5, 10]) {
      close(dcf(stock, years).value, fadingGrowthDcfPerShare(
        stock.assumptions.normalizedFcfPerShare, stock.assumptions.startingGrowth,
        item.ke, stock.assumptions.terminalGrowth, years,
      ), 'FCF DCF uses equity cost rather than WACC');
    }
  });
  test(item.id + ' gives both FCF DCF horizons truthful Chinese and English source labels', () => {
    const stock = calculateStock({ ...base, ...item.patch });
    for (const years of [5, 10]) {
      const model = dcf(stock, years);
      assert.match(model.explanation, item.explicit ? /明確輸入股權成本/ : /CAPM 股權成本/);
      if (item.explicit) assert.doesNotMatch(model.explanation, /CAPM 股權成本/);
      // A missing optional field is an assertion failure, never a TypeError.
      assert.equal(typeof model.explanationEn, 'string', 'new DCF English explanation must be well formed');
      assert.match(model.explanationEn, /cost of equity/i);
      assert.match(model.explanationEn, item.explicit ? /explicit[- ]input/i : /CAPM/i);
      if (item.explicit) assert.doesNotMatch(model.explanationEn, /CAPM/i);
      assert.ok(model.explanationEn.includes(String(stock.assumptions.costOfEquity * 100) + '%'), 'actual clamped rate');
      assert.ok(model.explanationEn.includes(String(stock.assumptions.startingGrowth * 100) + '%'), 'actual initial growth');
      assert.ok(model.explanationEn.includes(String(stock.assumptions.terminalGrowth * 100) + '%'), 'actual terminal growth');
      assert.doesNotMatch(model.explanationEn, /source.certified|source.verified|verified market data/i);
      assert.equal(explanation(model, 'en'), model.explanationEn, 'English UI uses the computed explanation');
      assert.equal(explanation(model, 'zh'), model.explanation);
    }
  });
}

test('CAPM default parameters retain their existing assumptions and are not certified by the caption', () => {
  const stock = calculateStock({ ...base, ...cases.at(-1).patch });
  close(stock.assumptions.beta, 1.05, 'industrial default beta');
  close(stock.assumptions.riskFreeRate, .0425, 'US default risk-free rate');
  close(stock.assumptions.marketRiskPremium, .0525, 'US default market risk premium');
  close(stock.assumptions.countryRiskPremium, 0, 'US default country risk premium');
  for (const label of ['beta（市場／產業預設）', '無風險利率', '市場風險溢酬', '國家風險溢酬']) {
    assert.ok(stock.assumptions.defaulted.includes(label), label);
  }
});

test('the actual UI formatter rounds captions while keeping CAPM and DCF calculations at full precision', () => {
  const input = { ...base, ...cases.at(-1).patch };
  const unformatted = calculateStock(input);
  const displayed = calculateStock(input, uiFormatNumber);
  close(displayed.assumptions.costOfEquity, .097625, 'full precision CAPM');
  assert.equal(uiFormatNumber(displayed.assumptions.costOfEquity * 100), '9.76');
  for (const years of [5, 10]) {
    const model = dcf(displayed, years);
    assert.equal(model.value, dcf(unformatted, years).value, 'formatter cannot alter the DCF amount');
    assert.equal(model.rangeLow, dcf(unformatted, years).rangeLow);
    assert.equal(model.rangeHigh, dcf(unformatted, years).rangeHigh);
    assert.match(model.explanation, /CAPM 股權成本 9\.76%/);
    assert.match(model.explanationEn, /CAPM cost of equity 9\.76%/);
    assert.match(model.explanationEn, /initial growth 2\.55%/);
    assert.match(model.explanationEn, /terminal growth 2\.58%/);
    assert.equal(explanation(model, 'en'), model.explanationEn);
  }
});

test('English UI uses a supplied model explanation without guessing source from an effective rate', () => {
  const model = { ...dcf(calculateStock({ ...base, discountRate: .1 }), 5),
    explanationEn: 'Controlled explicit-input cost of equity caption.' };
  assert.equal(explanation(model, 'en'), model.explanationEn);
});

test('legacy FCF DCF models without an English field get a neutral cost-of-equity fallback', () => {
  for (const years of [5, 10]) {
    const { explanationEn: unused, ...legacy } = dcf(calculateStock({ ...base, discountRate: .1 }), years);
    void unused;
    const caption = explanation(legacy, 'en');
    assert.match(caption, /cost of equity/i);
    assert.doesNotMatch(caption, /CAPM|explicit[- ]input|WACC/i);
  }
});

test('an actual excluded FCF DCF row names equity cost and the terminal relationship in English', () => {
  const stock = calculateStock({ ...base, fcfPerShare: 0, discountRate: .1 });
  for (const years of [5, 10]) {
    const model = stock.excludedModels.find(item => item.id === `dcf-fcf-${years}y`);
    assert.ok(model, 'actual excluded FCF DCF must be available');
    const html = renderToStaticMarkup(React.createElement(ExcludedModelRow, { model, language: 'en' }));
    assert.match(html, /class="excluded-model-row"/);
    assert.match(html, /cost of equity/i);
    assert.match(html, /terminal.?growth/i);
    assert.doesNotMatch(html, /WACC/);
  }
});

test('operating exit DCF retains its computed WACC denominator and English description', () => {
  const stock = calculateStock({ ...base, discountRate: .1, price: 100, bvps: 20,
    targetPe: 20, targetPb: 2, targetFcfMultiple: 20, debtPerShare: 10, cashPerShare: 5,
    revenuePerShare: 40, ebitdaPerShare: 8, ebitPerShare: 6,
    targetEvEbitdaMultiple: 8, targetEvRevenueMultiple: 2, targetEvEbitMultiple: 10,
  });
  const { assumptions: a } = stock;
  close(a.costOfEquity, .1, 'equity override');
  close(a.wacc, .1 * (100 / 110) + .055 * (1 - .21) * (10 / 110), 'proxy-weighted WACC');
  assert.notEqual(a.wacc, a.costOfEquity, 'input discountRate is not direct WACC');
  for (const [kind, metric, multiple] of [['ebitda', 8, 8], ['revenue', 40, 2]]) {
    for (const years of [5, 10]) {
      const model = stock.models.find(item => item.id === `dcf-${kind}-${years}y`);
      assert.ok(model, 'controlled operating exit DCF must be retained');
      close(model.value, fadingGrowthOperatingExitDcfPerShare(
        4 + 10 * .055 * (1 - .21), metric, a.startingGrowth, a.wacc,
        a.terminalGrowth, multiple, 5, years,
      ), 'operating FCFF uses WACC');
      assert.match(model.explanation, /WACC/);
      assert.match(explanation(model, 'en'), /WACC/);
      assert.doesNotMatch(explanation(model, 'en'), /explicit[- ]input cost of equity/i);
    }
  }
});

test('an actual excluded operating exit DCF row keeps its WACC description', () => {
  const stock = calculateStock({ ...base, fcfPerShare: 0, discountRate: .1 });
  for (const id of ['dcf-ebitda-5y', 'dcf-revenue-10y']) {
    const model = stock.excludedModels.find(item => item.id === id);
    assert.ok(model);
    const html = renderToStaticMarkup(React.createElement(ExcludedModelRow, { model, language: 'en' }));
    assert.match(html, /WACC/);
  }
});
