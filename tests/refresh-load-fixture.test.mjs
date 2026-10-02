import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LOAD_LEVELS,REFRESH_LOAD_FIXTURE_SEED,buildRefreshLoadFixture,
  refreshLoadFixtureFingerprint} from '../scripts/refresh-load-fixture.mjs';
import {DAILY_VALUATION_VERSION,dailyValuationState} from '../lib/daily-valuation-state.ts';
import {buildTaiwanComparableMap} from '../lib/taiwan-comparables.ts';
import {validateRecord} from '../lib/daily-refresh-store.ts';
import {validRefreshCandles} from '../lib/daily-refresh-data.ts';

test('load fixture is deterministic, synthetic and independent of runtime modules',()=>{
  const a=buildRefreshLoadFixture('dense185',{valuationVersion:DAILY_VALUATION_VERSION});
  const b=buildRefreshLoadFixture(LOAD_LEVELS[0],{valuationVersion:DAILY_VALUATION_VERSION});
  assert.deepEqual(a,b);
  assert.equal(a.meta.seed,REFRESH_LOAD_FIXTURE_SEED);
  assert.equal(a.meta.synthetic,true);
  assert.match(refreshLoadFixtureFingerprint(a),/^[a-f0-9]{64}$/);
  assert.equal(refreshLoadFixtureFingerprint(a),refreshLoadFixtureFingerprint(b));
  assert.notEqual(refreshLoadFixtureFingerprint(a),refreshLoadFixtureFingerprint(buildRefreshLoadFixture('dense185',{seed:7})));
  assert.notEqual(a.records[0],b.records[0]);
  assert.match(a.records[0].stock.sourceNote,/SYNTHETIC/);
  assert.deepEqual(a.records[0].sources,['synthetic://refresh-load-fixture/generated']);
  const source=readFileSync(new URL('../scripts/refresh-load-fixture.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"]\.\.?\/|process\.env|fetch\(/);
});

test('every fixed load level has legal unique identities, bounded real groups and causal dates',()=>{
  assert.deepEqual(LOAD_LEVELS.map(level=>[level.id,level.twCount,level.groupSize,level.usCount]),[
    ['dense185',185,185,8],['groups740',740,185,8],['usefulReady6165',1850,185,4315],
  ]);
  for(const level of LOAD_LEVELS) {
    const {records,manifest,meta}=buildRefreshLoadFixture(level,{valuationVersion:DAILY_VALUATION_VERSION});
    assert.equal(records.length,level.twCount+level.usCount);
    assert.equal(manifest.targets.length,records.length);
    assert.equal(new Set(records.map(row=>`${row.market}:${row.ticker}`)).size,records.length);
    const groups=new Map();
    for(const record of records) {
      assert.match(record.ticker,/^[A-Z0-9.-]{1,12}$/);
      if(record.market==='TW') {
        assert.match(record.ticker,/^\d{4}$/);
        groups.set(record.stock.industry,(groups.get(record.stock.industry)??0)+1);
      }
      assert.equal(record.quoteDate,'2026-10-01');assert.equal(record.financialDate,'2026-06-30');
      assert.equal(record.history.candles.length,80);
      assert.equal(record.history.candles.at(-1).close,record.stock.price);
      assert.ok(validRefreshCandles(record.history.candles,record.quoteDate));
      assert.equal(record.history.technicalAnalysis.asOf,record.quoteDate);
      assert.equal(record.history.technicalAnalysis.valueTrendResonance,null);
      assert.equal(record.stock.comparableMultiples,undefined);
      assert.equal(record.stock.financialMetrics.enterpriseBridgeEvidence,undefined);
      assert.equal(record.stock.financialMetrics.sharesOutstanding,100000000);
      assert.equal(record.stock.eps,record.stock.financialMetrics.netIncomePerShare);
      assert.equal(record.stock.roe,record.stock.eps/record.stock.bvps*100);
    }
    assert.equal(groups.size,meta.twGroupCount);
    assert.ok([...groups.values()].every(size=>size<=185&&size>1));
    assert.equal([...groups.values()].filter(size=>size===185).length,Math.floor(level.twCount/185));
  }
});

test('dense inputs pass refresh validation and generate 184 usable PE/PB/PS observations, not padding',()=>{
  const {records,manifest,meta}=buildRefreshLoadFixture('dense185',{valuationVersion:DAILY_VALUATION_VERSION});
  for(const row of records)assert.doesNotThrow(()=>validateRecord(row,manifest,meta.runId));
  const tw=records.filter(row=>row.market==='TW').map(row=>row.stock);
  const peers=buildTaiwanComparableMap(tw);
  assert.equal(peers.size,185);
  for(const stock of tw) {
    const evidence=peers.get(stock.ticker);
    assert.equal(evidence.peerCount,184);
    assert.equal(evidence.pePeerCount,184);assert.equal(evidence.pbPeerCount,184);assert.equal(evidence.psPeerCount,184);
    assert.equal(evidence.evRevenuePeerCount,0);assert.equal(evidence.evEbitdaPeerCount,0);assert.equal(evidence.evEbitPeerCount,0);
    for(const model of ['pe','pb','p-sales']) {
      assert.equal(evidence.taiwanApplicabilityEvidence.models[model].observations.length,184);
    }
  }
  const states=tw.map(stock=>({ticker:stock.ticker,state:dailyValuationState({...stock,comparableMultiples:peers.get(stock.ticker)},meta.runId)}));
  assert.ok(states.every(({state})=>state.hasModel&&!state.rankingEligible&&Number.isFinite(state.estimatedUpside)));
  states.sort((a,b)=>b.state.estimatedUpside-a.state.estimatedUpside||a.ticker.localeCompare(b.ticker));
  assert.equal(states[0].ticker,meta.highestNativeGapTicker);
  assert.equal(states[0].ticker,[...tw].sort((a,b)=>a.ticker.localeCompare(b.ticker)).at(-1).ticker);
});

test('fixture rejects unbounded shapes and allows explicit same-contract revision/date options',()=>{
  for(const level of ['missing',{id:'scale10000',twCount:10000,groupSize:10000,usCount:8},
    {id:'dense185',twCount:185,groupSize:10000,usCount:8}]) {
    assert.throws(()=>buildRefreshLoadFixture(level),/UNKNOWN_REFRESH_LOAD_LEVEL/);
  }
  for(const options of [{seed:-1},{seed:1.1},{seed:0x100000000},{date:'2026-02-30'},
    {financialDate:'2026-10-02'},{financialDate:'2025-01-01'},{runId:'bad'},{valuationVersion:''}]) {
    assert.throws(()=>buildRefreshLoadFixture('dense185',options),/INVALID_FIXTURE_/);
  }
  const custom=buildRefreshLoadFixture('groups740',{seed:7,date:'2026-09-30',financialDate:'2026-06-30',
    runId:'baseline_fixture_run',valuationVersion:'explicit-baseline-version'});
  assert.equal(custom.manifest.valuationVersion,'explicit-baseline-version');
  assert.equal(custom.meta.runId,'baseline_fixture_run');
  assert.equal(custom.records.at(-1).history.candles.at(-1).date,'2026-09-30');
  assert.ok(custom.records.filter(row=>row.market==='TW').every(row=>row.stock.dailyValuationVersion==='explicit-baseline-version'));
});
