import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectLegacyBenchmarkTarget, summarizeLegacyTargets, formatLegacyMetric, renderLegacyBenchmarkReport} from '../scripts/legacy-benchmark-report.mjs';

// Synthetic only: these tests do not establish external valuation accuracy.
const stock = {models:[{value:10}, {value:30}], fairValue:15};
test('legacy targets distinguish workbook numbers from self-model proxies', () => {
  assert.deepEqual(selectLegacyBenchmarkTarget(stock, 50), {target:50, targetKind:'workbook-unverified'});
  for (const value of [null, undefined, 0, -5, NaN, Infinity, '50']) {
    assert.deepEqual(selectLegacyBenchmarkTarget(stock, value), {target:20, targetKind:'self-model-proxy'});
  }
});
test('legacy proxy excludes invalid models, falls back only to a finite positive value', () => {
  assert.deepEqual(selectLegacyBenchmarkTarget({models:[{value:Infinity}, {value:0}, {value:NaN}, {value:8}], fairValue:12}), {target:8, targetKind:'self-model-proxy'});
  assert.deepEqual(selectLegacyBenchmarkTarget({models:[], fairValue:12}), {target:12, targetKind:'self-model-proxy'});
  assert.deepEqual(selectLegacyBenchmarkTarget({models:[], fairValue:NaN}), {target:null, targetKind:'unavailable'});
  assert.equal(selectLegacyBenchmarkTarget({models:[{value:Number.MAX_VALUE}, {value:Number.MAX_VALUE}], fairValue:1}).target, Number.MAX_VALUE);
});
test('provenance counts reconcile and never certify an unrecognized or unusable target', () => {
  const items = [{target:8,targetKind:'workbook-unverified'}, {target:9,targetKind:'self-model-proxy'}, {target:-2,targetKind:'workbook-unverified'}, {target:5,targetKind:'other'}, {target:null,targetKind:'unavailable'}];
  assert.deepEqual(summarizeLegacyTargets(items), {total:5,workbookUnverified:1,selfModelProxy:1,unavailable:3});
});
test('proxy average preserves finite extremes and positive subnormals', () => {
  for (const [value, count] of [[Number.MAX_VALUE,3], [Number.MIN_VALUE,2]]) {
    assert.deepEqual(selectLegacyBenchmarkTarget({models:Array.from({length:count},()=>({value})),fairValue:1}), {target:value,targetKind:'self-model-proxy'});
  }
});
test('metrics preserve actual zero and missing results without fictional percentages', () => {
  assert.equal(formatLegacyMetric(0, {percent:true,count:2}), '0.00%');
  assert.equal(formatLegacyMetric(0, {percent:true,count:0}), 'N/A');
  for (const value of [null,undefined,NaN,Infinity,'0']) assert.equal(formatLegacyMetric(value,{percent:true}), 'N/A');
});
test('percentage scaling cannot print an infinite value', () => {
  assert.equal(formatLegacyMetric(1e307,{percent:true,count:2}),'N/A');
  assert.equal(formatLegacyMetric(-1e307,{percent:true,count:2}),'N/A');
  assert.doesNotMatch(renderLegacyBenchmarkReport({holdoutResults:[{id:'A',count:2,mdape:1e307}]}),/Infinity/);
});
test('report labels mixed targets and full-sample groups, never declares a winning production method', () => {
  const row = {id:'A',count:2,mdape:0,mape:0.02,medianSignedError:0,directionAccuracy:1,spearmanCorr:0,within10Pct:1};
  const data = {holdoutResults:[row,{...row,id:'O',mdape:0.5,mape:0.6}],sectorBreakdowns:{A:{Financials:{count:0,mdape:null,mape:null}}},marketBreakdowns:{A:{TW:row}},targetProvenance:{overall:{total:2,workbookUnverified:0,selfModelProxy:2,unavailable:0}},sampleCount:2,trainCount:1,holdoutCount:1};
  const output = renderLegacyBenchmarkReport(data);
  assert.match(output,/LEGACY_DIAGNOSTIC_ONLY/);
  assert.match(output,/不是外部 holdout/);
  assert.match(output,/全樣本市場診斷（不是 holdout）/);
  assert.match(output,/\| A \| Financials \| 0 \| N\/A \| N\/A \|/);
  assert.match(output,/\| A \| TW \| 2 \| 0\.00% \| 2\.00% \|/);
  assert.match(output,/\| overall \| 2 \| 0 \| 2 \| 0 \|/);
  assert.doesNotMatch(output,/大幅下降|顯著改善|最優推薦|20\+ 檔|60\+ 檔/);
  assert.equal(renderLegacyBenchmarkReport({}).includes('NaN'),false);
});
test('legacy report and runner retain explicit integrity warnings', () => {
  const report = readFileSync(new URL('../docs/valuation-benchmark.md',import.meta.url),'utf8');
  const runner = readFileSync(new URL('../scripts/benchmark-expert-consensus-calibration.mjs',import.meta.url),'utf8');
  assert.match(report,/2026-09-21 更正/);
  assert.match(report,/尚未重新執行舊實驗/);
  assert.match(runner,/renderLegacyBenchmarkReport\(data\)/);
  assert.match(runner,/summarizeLegacyTargets\(holdoutItems\)/);
  assert.doesNotMatch(runner,/大幅下降|顯著改善|最優推薦|Optimal simplex weights learned across holdout/);
});
