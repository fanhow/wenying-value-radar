import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildTaiwanComparableMap,createTaiwanComparableIndex,compactTaiwanComparableSource} from '../lib/taiwan-comparables.ts';
import {comparableIndexInputs} from './fixtures/taiwan-comparable-index-inputs.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const golden=JSON.parse(readFileSync(new URL('./fixtures/taiwan-comparable-index-f969a89-golden.json',import.meta.url),'utf8'));

test('compact index and collector wrapper exactly preserve pinned baseline output bytes and map order',()=>{
  const rows=comparableIndexInputs(),before=structuredClone(rows),index=createTaiwanComparableIndex(rows),map=buildTaiwanComparableMap(rows);
  const entries=[...map.entries()];
  assert.equal(golden.baselineCommit,'f969a89');assert.equal(hash(rows),golden.inputDigest);
  assert.equal(hash(entries),golden.outputDigest);assert.deepEqual(entries.map(([ticker])=>ticker),golden.tickers);
  for(const [ticker,result] of entries) {
    assert.equal(hash(result),golden.entryDigests[ticker]);assert.equal(JSON.stringify(index.evaluate(ticker)),JSON.stringify(result));
  }
  assert.deepEqual(rows,before);
});

test('index preserves duplicate conflicts, quote/financial/share cohorts, and valid/invalid business references',()=>{
  const rows=comparableIndexInputs(),index=createTaiwanComparableIndex(rows);
  assert.equal(index.evaluate('7002'),undefined);assert.equal(index.evaluate('7003'),undefined);
  for(const ticker of ['7500','7501','7502','7503','7504','7505','7510'])assert.equal(index.evaluate(ticker),undefined);
  assert.ok(index.evaluate('7000'));assert.ok(index.evaluate('7001'));
  for(const ticker of ['7000','7300','7400','7509','2451','7100','7200']) {
    const result=index.evaluate(ticker);assert.ok(result);
    assert.equal(hash(result),golden.entryDigests[ticker]);
    assert.ok(!result.peerTickers.includes(ticker));
  }
  assert.equal(index.evaluate('7509').peerCount,0);
  assert.equal(index.evaluate('2451').peerCount,6);
  assert.equal(index.evaluate('7100').peerCount,5);assert.equal(index.evaluate('7200').peerCount,5);
});

test('compact snapshots exclude all derived/large unrelated objects without changing native evidence',()=>{
  const source=comparableIndexInputs()[0],noisy={...source,comparableMultiples:{arbitrary:'derived'.repeat(200000)},
    dailyResearch:{inputDigest:'self-reported',estimatedUpside:999},sourceNote:'unused'.repeat(200000),
    epsHistory:Array.from({length:5000},()=>({value:10,end:'2025-12-31'})),earningsReport:{large:'unused'},
    institutionalSignal:{large:'unused'},fundPortfolioPe:{large:'unused'}};
  const compact=compactTaiwanComparableSource(noisy);
  for(const field of ['comparableMultiples','dailyResearch','sourceNote','epsHistory','earningsReport','institutionalSignal','fundPortfolioPe'])assert.equal(field in compact,false);
  assert.ok(Buffer.byteLength(JSON.stringify(compact))<2000);
  const rows=comparableIndexInputs();rows[0]=noisy;
  assert.equal(hash([...buildTaiwanComparableMap(rows)]),golden.outputDigest);
});

test('evaluated profiles are fresh per target so caller edits cannot alter the index or subsequent output',()=>{
  const index=createTaiwanComparableIndex(comparableIndexInputs()),a=index.evaluate('7000');
  a.taiwanApplicabilityEvidence.target.roe=999;
  a.taiwanApplicabilityEvidence.models.pe.observations[0].profile.roe=999;
  assert.equal(hash(index.evaluate('7000')),golden.entryDigests['7000']);
  assert.equal(hash(index.evaluate('7001')),golden.entryDigests['7001']);
});

test('the reusable index snapshots native business references instead of retaining mutable caller metadata',()=>{
  const rows=comparableIndexInputs(),index=createTaiwanComparableIndex(rows);
  const source=rows.find(s=>s.ticker==='2451');source.taiwanBusinessGroup.registryVersion='modified-after-index';
  source.financialMetrics.shareBasis='modified-after-index';source.price=999;
  assert.equal(hash(index.evaluate('2451')),golden.entryDigests['2451']);
});
