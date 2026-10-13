import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {buildRefreshLoadFixture} from '../scripts/refresh-load-fixture.mjs';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';
import {withDailyResearchCache} from '../lib/daily-research-ranking.ts';
import {handleRefreshWrite,handleDailyRead,validateRecord} from '../lib/daily-refresh-store.ts';

// Generated local observations only. These tests never fetch market data.
const secret='synthetic-test-key-000000000000000000000000';
const expectedSessions={TW:'2026-10-12',US:'2026-10-12'};
const runId='coverage_fixture_current';
const privateSentinel='SYNTHETIC_PRIVATE_PAYLOAD_SENTINEL';
const source=buildRefreshLoadFixture('dense185',{date:expectedSessions.TW,
  valuationVersion:DAILY_VALUATION_VERSION,runId});
const examples=Object.fromEntries(['TW','US'].map(market=>[market,source.records.filter(r=>r.market===market)]));

function database() {
  const raw=new DatabaseSync(':memory:');
  const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),run:async()=>raw.prepare(sql).run(...args),
    all:async()=>({results:raw.prepare(sql).all(...args)}),first:async()=>raw.prepare(sql).get(...args)??null});
  return {raw,prepare,batch:async statements=>{
    raw.exec('BEGIN');
    try {const result=[];for(const statement of statements)result.push(await statement.run());raw.exec('COMMIT');return result;}
    catch(error){raw.exec('ROLLBACK');throw error;}
  }};
}
const write=(db,body)=>handleRefreshWrite(new Request('https://fixture.test/api/data-refresh',{
  method:'POST',headers:{'X-WenYing-Refresh-Key':secret},body:JSON.stringify({runId,...body})}),db,secret);
const read=(db,path)=>handleDailyRead(new Request('https://fixture.test'+path),db);

function observations(totals,ready,omitted={TW:0,US:0}) {
  const targets=['TW','US'].flatMap(market=>Array.from({length:totals[market]},(_,index)=>({market,
    ticker:market==='TW'?String(1000+index):`SYNUS${index.toString(36).toUpperCase().padStart(4,'0')}`})));
  const manifest={valuationVersion:DAILY_VALUATION_VERSION,
    // Extra input fields must never leak through a diagnostics response.
    expectedSessions:{...expectedSessions,privateInput:privateSentinel},targets,universeSource:[privateSentinel]};
  const records=targets.flatMap(target=>{
    const marketTargets=targets.filter(t=>t.market===target.market),index=marketTargets.indexOf(target);
    if(index>=totals[target.market]-(omitted[target.market]??0))return [];
    if(index>=ready[target.market])return [{...target,status:'unavailable',issues:[privateSentinel],
      fetchedAt:'2026-10-13T03:06:40.000Z',sources:[`synthetic://${privateSentinel}`],rankingEligible:false}];
    const example=structuredClone(examples[target.market][index%examples[target.market].length]);
    return [{...example,...target,stock:{...example.stock,...target,name:'Synthetic coverage issuer',sourceNote:privateSentinel},
      history:{...example.history,...target,name:'Synthetic coverage issuer',symbol:target.ticker}}];
  });
  return {manifest,records:prepareTaiwanRefreshGeneration(records,runId)};
}

async function seed(db,totals,ready,omitted,state='running') {
  const fixture=observations(totals,ready,omitted);
  assert.equal((await write(db,{action:'begin',manifest:fixture.manifest})).status,200);
  const insert=db.raw.prepare(`INSERT INTO daily_refresh_records
    (run_id,market,ticker,status,stock,history,issues,upside,signals,eligible) VALUES(?,?,?,?,?,?,?,NULL,0,0)`);
  // Validate and cache all ready inputs before seeding. A count-only fake ready
  // row would fail the independent peer/cache seals on passing boundaries.
  for(const record of fixture.records) {
    validateRecord(record,fixture.manifest,runId);
    const stock=record.stock?await withDailyResearchCache(record.stock,runId):null;
    insert.run(runId,record.market,record.ticker,record.status,stock?JSON.stringify(stock):null,
      record.history?JSON.stringify(record.history):null,JSON.stringify(record.issues));
  }
  if(state!=='running')db.raw.prepare('UPDATE daily_refresh_runs SET state=? WHERE id=?').run(state,runId);
  return fixture;
}

function retainPriorGenerations(db,manifest) {
  const priorSummary={total:20,TW:{total:10,ready:2,unavailable:8},US:{total:10,ready:2,unavailable:8}};
  const insert=db.raw.prepare('INSERT INTO daily_refresh_runs(id,started_at,completed_at,state,manifest,summary) VALUES(?,?,?,?,?,?)');
  for(const [index,id] of ['retained_oldest','retained_previous','retained_active'].entries()) {
    insert.run(id,new Date(Date.now()-(3-index)*60000).toISOString(),new Date(Date.now()-(3-index)*60000).toISOString(),
      'partial',JSON.stringify(manifest),JSON.stringify(priorSummary));
    db.raw.prepare(`INSERT INTO daily_refresh_records(run_id,market,ticker,status,issues)
      VALUES(?,'TW','9999','unavailable','["SYNTHETIC_RETAINED"]')`).run(id);
    db.raw.prepare(`INSERT INTO daily_refresh_research_seals(run_id,market,version,digest,ready_count)
      VALUES(?,'TW','synthetic-prior-version','synthetic-prior-digest',0)`).run(id);
  }
  db.raw.prepare('INSERT INTO daily_refresh_head(id,run_id) VALUES(1,?)').run('retained_active');
}

function snapshot(db) {
  return {
    runs:db.raw.prepare('SELECT * FROM daily_refresh_runs ORDER BY id').all(),
    records:db.raw.prepare('SELECT * FROM daily_refresh_records ORDER BY run_id,market,ticker').all(),
    head:db.raw.prepare('SELECT * FROM daily_refresh_head ORDER BY id').all(),
    seals:db.raw.prepare('SELECT * FROM daily_refresh_research_seals ORDER BY run_id,market').all(),
  };
}
const coverage=(totals,ready,omitted={TW:0,US:0})=>({total:totals.TW+totals.US,
  TW:{total:totals.TW,ready:ready.TW,unavailable:totals.TW-ready.TW-(omitted.TW??0)},
  US:{total:totals.US,ready:ready.US,unavailable:totals.US-ready.US-(omitted.US??0)}});

async function rejectWithoutMutation(t,options) {
  const {totals,ready,omitted,state,error,market}=options,db=database();t.after(()=>db.raw.close());
  const fixture=await seed(db,totals,ready,omitted,state);
  retainPriorGenerations(db,fixture.manifest);
  const before=snapshot(db),response=await write(db,{action:'finalize',privateInput:privateSentinel});
  assert.equal(response.status,400);
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  const payload=await response.json();
  assert.deepEqual(payload,{error,diagnostics:{phase:'finalize',failingMarket:market,
    coverage:coverage(totals,ready,omitted),requiredReady:{TW:Math.min(100,Math.ceil(totals.TW*.2)),
      US:Math.min(100,Math.ceil(totals.US*.2))},expectedSessions}});
  assert.ok(!JSON.stringify(payload).includes(privateSentinel));
  assert.ok(!JSON.stringify(payload).includes(secret));
  // No failed summary/state update, seal, head switch or retention cleanup.
  assert.deepEqual(snapshot(db),before);
  const current=db.raw.prepare('SELECT state,summary,completed_at,error FROM daily_refresh_runs WHERE id=?').get(runId);
  assert.deepEqual({...current},{state:state??'running',summary:null,completed_at:null,error:null});
}

test('missing Taiwan batches report both markets and preserve all stored generations',async t=>{
  await rejectWithoutMutation(t,{totals:{TW:11,US:9},ready:{TW:3,US:2},omitted:{TW:1,US:0},
    error:'INCOMPLETE_BATCHES',market:'TW'});
});
test('missing US batches retain the same diagnostics contract and validating state',async t=>{
  await rejectWithoutMutation(t,{totals:{TW:11,US:9},ready:{TW:3,US:2},omitted:{TW:0,US:1},state:'validating',
    error:'INCOMPLETE_BATCHES',market:'US'});
});
test('insufficient Taiwan coverage includes adequate US coverage without publishing',async t=>{
  await rejectWithoutMutation(t,{totals:{TW:11,US:9},ready:{TW:2,US:2},
    error:'INSUFFICIENT_MARKET_COVERAGE',market:'TW'});
});
test('Taiwan coverage is still checked before incomplete US batches',async t=>{
  await rejectWithoutMutation(t,{totals:{TW:11,US:9},ready:{TW:2,US:2},omitted:{TW:0,US:1},
    error:'INSUFFICIENT_MARKET_COVERAGE',market:'TW'});
});
test('insufficient US coverage is rejected after Taiwan passes',async t=>{
  await rejectWithoutMutation(t,{totals:{TW:11,US:9},ready:{TW:3,US:1},
    error:'INSUFFICIENT_MARKET_COVERAGE',market:'US'});
});
test('the 100-ready cap still rejects 99 ready records in a 501-target market',async t=>{
  await rejectWithoutMutation(t,{totals:{TW:501,US:501},ready:{TW:99,US:100},
    error:'INSUFFICIENT_MARKET_COVERAGE',market:'TW'});
});

for(const [name,totals,ready] of [
  ['small manifests require the rounded-up 20-percent boundary',{TW:11,US:9},{TW:3,US:2}],
  ['501-target markets pass at exactly 100 ready records',{TW:501,US:501},{TW:100,US:100}],
])test(name+' and publish a readable partial head',async t=>{
  const db=database();t.after(()=>db.raw.close());await seed(db,totals,ready);
  const response=await write(db,{action:'finalize'});assert.equal(response.status,200);
  const payload=await response.json();assert.deepEqual(payload,{runId,state:'partial',coverage:coverage(totals,ready)});
  assert.equal(db.raw.prepare('SELECT run_id FROM daily_refresh_head WHERE id=1').get().run_id,runId);
  const stored=db.raw.prepare('SELECT state,summary,error FROM daily_refresh_runs WHERE id=?').get(runId);
  assert.equal(stored.state,'partial');assert.equal(stored.error,null);assert.deepEqual(JSON.parse(stored.summary),payload.coverage);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM daily_refresh_research_seals WHERE run_id=?').get(runId).n,2);
  const status=await (await read(db,'/api/daily-status')).json();assert.equal(status.state,'partial');assert.deepEqual(status.coverage,payload.coverage);
  const history=await read(db,'/api/price-history?ticker=1000&market=TW');assert.equal(history.status,200);
  assert.equal((await history.json()).candles.length,80);
  const ranking=await read(db,'/api/market-scan');assert.equal(ranking.status,200);assert.equal((await ranking.json()).freshness.state,'partial');
});
