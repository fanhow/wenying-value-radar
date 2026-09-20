import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {REFRESH_SCHEMA,handleDailyRead} from '../lib/daily-refresh-store.ts';
import {rotationAudit} from '../lib/rotation-audit-store.ts';
import {VALUE_REFERENCES} from '../lib/value-reference-audit.ts';
function database(){
  const raw=new DatabaseSync(':memory:');for(const sql of REFRESH_SCHEMA)raw.exec(sql);
  const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),all:async()=>({results:raw.prepare(sql).all(...args)}),first:async()=>raw.prepare(sql).get(...args)??null});
  return {raw,prepare};
}
test('SQL extraction uses exactly 21/63 prior sessions and same-generation records',async()=>{
  const db=database();
  for(const [i,ref] of VALUE_REFERENCES.filter(r=>r.market==='US').entries()){
    const stock={...ref,sector:'Technology',price:100,eps:5,bvps:30,fcfPerShare:4,roe:20,debtRatio:30,revenueGrowth:10+i,targetPe:15,targetPb:2,targetFcfMultiple:15,uncertainty:.3,updatedAt:'2026-09-18',financialDataDate:'2026-06-30',priceSource:'Yahoo Finance daily close / daily-refresh-v1'};
    const history={candles:Array.from({length:64},(_,j)=>({close:37+j}))};
    db.raw.prepare('INSERT INTO daily_refresh_records(run_id,market,ticker,status,stock,history,issues,upside,eligible) VALUES(?,?,?,?,?,?,?,?,?)').run('test-run','US',ref.ticker,'ready',JSON.stringify(stock),JSON.stringify(history),'[]',i/10,1);
  }
  const result=await rotationAudit(db,'test-run','US');
  assert.equal(result.compared.length,10);assert.equal(result.screen.candidates.length,10);
  assert.equal(result.screen.candidates[0].momentum63,100/37-1);
  assert.equal(result.screen.candidates[0].momentum21,100/79-1);
  assert.equal(result.summary.matched,0); // Deliberately non-matching synthetic quotes.
  assert.equal((await rotationAudit(db,'other-run','US')).screen.candidates.length,0);
  db.raw.close();
});
test('audit API has no missing-database or stale-generation snapshot fallback',async()=>{
  assert.equal((await handleDailyRead(new Request('https://test/api/rotation-audit'),undefined)).status,503);
  const db=database();assert.equal((await handleDailyRead(new Request('https://test/api/rotation-audit'),db)).status,503);db.raw.close();
});
test('reference set is exactly the supplied 10 + 10, with internally consistent rounded upside',()=>{
  assert.equal(VALUE_REFERENCES.length,20);assert.equal(new Set(VALUE_REFERENCES.map(r=>r.market+r.ticker)).size,20);
  for(const r of VALUE_REFERENCES)assert.ok(Math.abs((r.fairValue/r.price-1)*100-r.upsidePct)<.11,r.ticker);
});
