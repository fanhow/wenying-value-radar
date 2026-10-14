import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{tsmcTifrsInputs,validTsmcOfficialInput}from'../lib/tsmc-tifrs-official-inputs.ts';import{createTaiwanComparableIndex,compactTaiwanComparableSource}from'../lib/taiwan-comparables.ts';
const financial=JSON.parse(readFileSync(new URL('./fixtures/tsmc-tifrs-2330-financial-20261013.json',import.meta.url)));
const good={ticker:'2330',name:'TSMC',market:'TW',sector:'Technology',industry:'半導體業',price:2490,targetPe:25,targetPb:4,targetFcfMultiple:20,uncertainty:.3,updatedAt:'2026-10-13',sourceInputPolicy:'verified-input-scope-2026-10-14-v2',...tsmcTifrsInputs('2330',financial,'2026-10-13',new Date('2026-10-14T05:00:00Z'))};
// Exercise actual default peer eligibility in producer and server. The
// producer retains its original policy; the server owns new review/profile.
test('official issuer eligibility conflicts are rejected in both duplicate orders instead of adopting the last copy',()=>{
 assert.equal(validTsmcOfficialInput(good),true);assert.ok(createTaiwanComparableIndex([good]).evaluate('2330'));
 const missingProof=structuredClone(good);delete missingProof.officialFinancialAdapter;assert.equal(validTsmcOfficialInput(missingProof),false);assert.equal(createTaiwanComparableIndex([missingProof]).evaluate('2330'),undefined);
 for(const order of [[good,missingProof],[missingProof,good]]){const before=JSON.stringify(order),index=createTaiwanComparableIndex(order);assert.equal(index.sourceCount,0);assert.equal(index.evaluate('2330'),undefined);assert.equal(JSON.stringify(order),before);}
});
test('policy/proof provenance conflicts fail closed; an identical official duplicate remains a single valid source',()=>{
 for(const change of [s=>delete s.sourceInputPolicy,s=>s.sourceInputPolicy='unknown-policy',s=>s.officialFinancialAdapter.providerFinancialFetchedAt='2026-10-14T05:01:00.000Z']){
  const altered=structuredClone(good);change(altered);
  for(const order of [[good,altered],[altered,good]]){const index=createTaiwanComparableIndex(order);assert.equal(index.sourceCount,0);assert.equal(index.evaluate('2330'),undefined);}
 }
 const one=createTaiwanComparableIndex([good]),same=createTaiwanComparableIndex([good,structuredClone(good)]);assert.equal(same.sourceCount,1);assert.deepEqual(same.evaluate('2330'),one.evaluate('2330'));
 assert.equal(validTsmcOfficialInput(compactTaiwanComparableSource(good)),true);
});
