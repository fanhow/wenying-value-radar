import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {REFRESH_SCHEMA,readResearchStockPage,RESEARCH_INTEGRITY_PAGE_BYTES,RESEARCH_INTEGRITY_PAGE_ROWS} from '../lib/daily-refresh-store.ts';
import {createTaiwanComparableIndex,compactTaiwanComparableSource} from '../lib/taiwan-comparables.ts';
import {comparableIndexInputs} from './fixtures/taiwan-comparable-index-inputs.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const golden=JSON.parse(readFileSync(new URL('./fixtures/taiwan-comparable-index-f969a89-golden.json',import.meta.url),'utf8'));
function database() {
  const raw=new DatabaseSync(':memory:');for(const sql of REFRESH_SCHEMA)raw.exec(sql);
  const prepare=(sql,args=[])=>({bind:(...values)=>prepare(sql,values),all:async()=>({results:raw.prepare(sql).all(...args)})});
  const insert=raw.prepare('INSERT OR REPLACE INTO daily_refresh_records(run_id,market,ticker,status,stock,issues) VALUES(?,?,?,?,?,?)');
  return {raw,prepare,insert:stock=>insert.run('source_page_fixture',stock.market,stock.ticker,'ready',JSON.stringify(stock),'[]')};
}

test('SQL source projection preserves every native key/type and pinned current-generation peer evidence',async()=>{
  const db=database(),unique=[...new Map(comparableIndexInputs().map(stock=>[stock.ticker,stock])).values()];
  for(const stock of unique)db.insert({...stock,comparableMultiples:{derived:'x'.repeat(1000)},dailyResearch:{hasModel:true,estimatedUpside:999}});
  try {
    const projected=await readResearchStockPage(db,'source_page_fixture','TW','',true);
    assert.equal(projected.length,unique.length);
    for(const row of projected) {
      const source=JSON.parse(row.stock),expected=JSON.parse(JSON.stringify(unique.find(stock=>stock.ticker===row.ticker)));
      assert.deepEqual(source,expected);assert.equal(row.stock_bytes,Buffer.byteLength(row.stock));
      assert.equal('dailyResearch' in source,false);assert.equal('comparableMultiples' in source,false);
    }
    const index=createTaiwanComparableIndex(projected.map(row=>compactTaiwanComparableSource(JSON.parse(row.stock))));
    for(const source of unique) {
      const expected=golden.uniqueEntryDigests[source.ticker],value=index.evaluate(source.ticker);
      if(expected)assert.equal(hash(value),expected);else assert.equal(value,undefined);
    }
    const native={...unique[0],ticker:'NATIVE',qualityAvailable:false,taiwanBusinessGroup:null,
      customNative:{flag:false,missing:null},financialMetrics:{...unique[0].financialMetrics,shareAsOfDate:null}};
    db.insert({...native,comparableMultiples:{heavy:'x'},dailyResearch:{hasModel:false}});
    const typed=JSON.parse((await readResearchStockPage(db,'source_page_fixture','TW','NATIV',true))[0].stock);
    assert.deepEqual(typed,JSON.parse(JSON.stringify(native)));assert.equal(typed.qualityAvailable,false);
    assert.equal(typed.taiwanBusinessGroup,null);assert.equal(typed.financialMetrics.shareAsOfDate,null);
    assert.equal('shareSourceField' in typed.financialMetrics,false);
  }finally {db.raw.close();}
});

test('source pages bound projected bytes, preserve oversized singleton progress and handle empty/end cursors',async()=>{
  const db=database(),source=comparableIndexInputs()[0];
  const oversized={...source,ticker:'A',sourceNote:'x'.repeat(RESEARCH_INTEGRITY_PAGE_BYTES+1),
    comparableMultiples:{derived:'x'.repeat(100000)},dailyResearch:{hasModel:false}};
  db.insert(oversized);db.insert({...source,ticker:'B',comparableMultiples:{derived:'x'.repeat(100000)}});
  try {
    const first=await readResearchStockPage(db,'source_page_fixture','TW','',true);
    assert.deepEqual(first.map(row=>row.ticker),['A']);assert.ok(first[0].stock_bytes>RESEARCH_INTEGRITY_PAGE_BYTES);
    const second=await readResearchStockPage(db,'source_page_fixture','TW','A',true);
    assert.deepEqual(second.map(row=>row.ticker),['B']);assert.ok(second[0].stock_bytes<2000);
    assert.deepEqual(await readResearchStockPage(db,'source_page_fixture','TW','B',true),[]);
    assert.deepEqual(await readResearchStockPage(db,'missing-run','TW','',true),[]);
  }finally {db.raw.close();}
});

test('source projection window remains row-bounded without dropping the final stock',async()=>{
  const db=database(),source=comparableIndexInputs()[0];
  for(let i=0;i<RESEARCH_INTEGRITY_PAGE_ROWS+1;i++)db.insert({...source,ticker:`S${String(i).padStart(4,'0')}`});
  try {
    const first=await readResearchStockPage(db,'source_page_fixture','TW','',true);
    assert.equal(first.length,RESEARCH_INTEGRITY_PAGE_ROWS);assert.ok(first.reduce((sum,row)=>sum+row.stock_bytes,0)<=RESEARCH_INTEGRITY_PAGE_BYTES);
    const second=await readResearchStockPage(db,'source_page_fixture','TW',first.at(-1).ticker,true);
    assert.equal(second.length,1);assert.equal(second[0].ticker,'S0500');
  }finally {db.raw.close();}
});
