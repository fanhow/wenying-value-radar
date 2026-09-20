import test from 'node:test';
import assert from 'node:assert/strict';
import {compareMemoryPeerAudit} from '../scripts/compare-taiwan-memory-peers.mjs';
const tickers=['3135','3260','4967','4973','8088','8271','8277'];
function fixture() {
  const baseline={inputSha256:'synthetic-fixture',rows:tickers.map(ticker=>({ticker,stock:{ticker,market:'TW',price:100,updatedAt:'2026-09-18'},candidate:{fairValue:200,models:[{id:'synthetic'}],reviewRequired:true}}))};
  const candidate=structuredClone(baseline);for(const r of candidate.rows)r.candidate.fairValue=110;
  const references={inputSha256:baseline.inputSha256,rows:tickers.map(ticker=>({ticker,price:100,fairValue:100,quoteDate:'2026-09-18'}))};
  return [baseline,candidate,references];
}
test('paired research statistics retain review cases without classifying them as recommendations',()=>{
  const r=compareMemoryPeerAudit(...fixture());assert.equal(r.coverage.aligned,7);
  assert.ok(Math.abs(r.baseline.meanAbsoluteGapPct-100)<1e-10);assert.ok(Math.abs(r.candidate.meanAbsoluteGapPct-10)<1e-10);
  assert.ok(r.rows.every(s=>s.reviewRequired));
});
test('paired comparison rejects duplicate identities independent of ordering',()=>{
  for(const side of [0,1])for(const first of [true,false]) {
    const data=fixture(),duplicate=structuredClone(data[side].rows[0]);duplicate.candidate.fairValue=1000;
    data[side].rows[first?'unshift':'push'](duplicate);
    assert.throws(()=>compareMemoryPeerAudit(...data),/DUPLICATE_AUDIT_IDENTITY/);
  }
});
test('both baseline and candidate require matching dates and prices',()=>{
  for(const side of [0,1])for(const patch of [{price:1},{updatedAt:'2020-01-01'}]) {
    const data=fixture();Object.assign(data[side].rows[0].stock,patch);
    const r=compareMemoryPeerAudit(...data);assert.equal(r.rows[0].aligned,false);assert.equal(r.coverage.aligned,6);
  }
  const data=fixture();data[2].rows[0].quoteDate=null;
  assert.equal(compareMemoryPeerAudit(...data).rows[0].aligned,false);
});
test('missing models are unavailable, not zero or a matched minus-100-percent observation',()=>{
  const data=fixture();data[1].rows[0].candidate={fairValue:0,models:[]};
  const r=compareMemoryPeerAudit(...data);assert.equal(r.rows[0].candidateValue,null);assert.equal(r.rows[0].candidateGapPct,null);assert.equal(r.coverage.aligned,6);
});
test('overflow cannot become a matched JSON null or poison the statistic denominator',()=>{
  const data=fixture();data[2].rows[0].fairValue=Number.MIN_VALUE;
  const r=compareMemoryPeerAudit(...data);assert.equal(r.rows[0].aligned,false);assert.ok(r.rows[0].issues.includes('NON_FINITE_GAP'));
  assert.equal(r.candidate.count,6);assert.ok(Number.isFinite(r.candidate.meanAbsoluteGapPct));assert.equal(r.rows[0].candidateGapPct,null);
});
test('fixed cases, input provenance and Taiwan identities cannot be silently changed',()=>{
  for(const mutate of [d=>d[0].inputSha256='other',d=>d[2].rows.reverse(),d=>d[1].rows[0].stock.market='US',d=>d[1].rows[0].stock.ticker='9999']) {
    const data=fixture();mutate(data);assert.throws(()=>compareMemoryPeerAudit(...data));
  }
});
