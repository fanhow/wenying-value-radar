import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TAIWAN_BUSINESS_GROUPS,TAIWAN_BUSINESS_REGISTRY_VERSION,withTaiwanBusinessGroup,validTaiwanBusinessGroupReference} from '../lib/taiwan-business-groups.ts';
import {buildTaiwanComparableMap,validTaiwanComparableEvidence} from '../lib/taiwan-comparables.ts';
import {calculateStock} from '../lib/valuation.ts';

const stock=(ticker,price=100)=>({ticker,name:'測試公司',market:'TW',sector:'台灣上市公司',industry:'半導體業',price,
  eps:5,bvps:40,fcfPerShare:3,revenuePerShare:100,ebitPerShare:8,ebitdaPerShare:10,cashPerShare:5,debtPerShare:10,
  targetPe:36,targetPb:5,targetFcfMultiple:20,netMargin:5,netMarginUnit:'percent',revenueGrowth:10,roe:15,debtRatio:40,uncertainty:.3,
  dataBasis:'ltm',dataCompleteness:'historical',financialDataDate:'2026-06-30',updatedAt:'2026-09-18',priceSource:'Yahoo Finance daily close / daily-refresh-v1',
  financialMetrics:{currency:'TWD',periodBasis:'ltm',shareBasis:'period-end-ordinary',roeBasis:'parent-income-average-equity',growthBasis:'ttm-yoy',sharesOutstanding:1e8,netIncomePerShare:5,nonControllingBookPerShare:0,ebitdaBasis:'operating-income-plus-cashflow-da'}});
const raw=()=>TAIWAN_BUSINESS_GROUPS[0].members.map((m,i)=>stock(m.ticker,100+i));
const group=()=>raw().map(withTaiwanBusinessGroup);
const value=(s,p)=>calculateStock({...s,comparableMultiples:p,valuationPolicy:'tw-comparables-v1'});

test('issuer registry is source-backed, versioned and contains no target/multiple values',()=>{
  const g=TAIWAN_BUSINESS_GROUPS[0];
  assert.equal(g.fiscalPeriodEnd,'2025-12-31');
  assert.deepEqual(g.members.map(m=>m.ticker),['2451','3135','3260','4967','4973','8088','8271']);
  assert.equal(g.members.length,new Set(g.members.map(m=>m.ticker)).size);
  for(const m of g.members){assert.match(m.sourceUrl,/^https:\/\//);assert.ok(m.printedPages&&m.pdfPages&&m.revenueEvidence);}
  assert.equal(g.members.find(m=>m.ticker==='8088').role,'module-manufacturer-mixed-ems');
  assert.equal(withTaiwanBusinessGroup(stock('8277')).taiwanBusinessGroup,undefined);
  assert.doesNotMatch(JSON.stringify(g),/fairValue|targetPe|peMedian|upside/);
});

test('explicit business peers can cross industries without rewriting sector/industry',()=>{
  const rows=group().map((s,i)=>i===6?{...s,industry:'電腦及週邊設備業'}:s);
  const p=buildTaiwanComparableMap(rows).get('2451');
  assert.equal(p.peerCount,6);assert.ok(p.peerTickers.includes('8271'));
  assert.equal(p.method,'tw-business-group-same-session-median');
  assert.equal(p.taiwanBusinessRegistryVersion,TAIWAN_BUSINESS_REGISTRY_VERSION);
  assert.equal(p.sector,'半導體業');assert.equal(rows[6].industry,'電腦及週邊設備業');
  assert.ok(validTaiwanComparableEvidence({...rows[0],comparableMultiples:p}));
  const s=value(rows[0],p);assert.ok(s.models.length>0);assert.match(s.models.find(m=>m.id==='pe').explanation,/同日同業務群/);
});

test('business self/session/market-cap gates stay identical, five peers minimum',()=>{
  for(const patch of [{updatedAt:'2026-09-17'},{financialMetrics:{...stock('8271').financialMetrics,sharesOutstanding:1e6}}]){
    const rows=group().map((s,i)=>i===6?{...s,...patch}:s),p=buildTaiwanComparableMap(rows).get('2451');
    assert.equal(p.peerCount,5);assert.ok(!p.peerTickers.includes('2451'));assert.ok(!p.peerTickers.includes('8271'));
  }
  assert.ok(buildTaiwanComparableMap(group().slice(0,6)).get('2451'));
  assert.equal(buildTaiwanComparableMap(group().slice(0,5)).has('2451'),false);
});

test('unclassified industry targets keep exactly the original peer population',()=>{
  const unclassified=stock('2330',130),before=buildTaiwanComparableMap([...raw(),unclassified]).get('2330');
  const after=buildTaiwanComparableMap([...group(),unclassified]).get('2330');
  assert.deepEqual(after,before);assert.equal(after.method,'tw-industry-same-session-median');
  assert.deepEqual(value(unclassified,after),value(unclassified,before));
});

test('unknown, wrong-version and non-member references fail closed without industry fallback',()=>{
  const rows=group(),ref=rows[0].taiwanBusinessGroup;
  for(const s of [{...rows[0],taiwanBusinessGroup:{...ref,id:'unknown'}},{...rows[0],taiwanBusinessGroup:{...ref,registryVersion:'old'}},{...stock('2330'),taiwanBusinessGroup:ref},{...rows[0],taiwanBusinessGroup:null}]){
    assert.equal(validTaiwanBusinessGroupReference(s),false);
    const p=buildTaiwanComparableMap([...rows.filter(r=>r.ticker!==s.ticker),s]).get(s.ticker);
    assert.equal(p,undefined);assert.equal(value(s,p).models.length,0);
    assert.deepEqual(withTaiwanBusinessGroup(s),s);
  }
});

test('forged business method, version, target or peer membership cannot activate a model',()=>{
  const rows=group(),p=buildTaiwanComparableMap(rows).get('2451');
  for(const bad of [{...p,method:'tw-industry-same-session-median'},{...p,taiwanBusinessRegistryVersion:'old'},
    {...p,peerGroup:'other'}, {...p,peerTickers:['8299',...p.peerTickers.slice(1)]}])assert.equal(value(rows[0],bad).models.length,0);
  assert.equal(value({...rows[0],taiwanBusinessGroup:undefined},p).models.length,0);
  assert.equal(value({...rows[0],ticker:'2330'},p).models.length,0);
});

test('conflicting classification duplicates are excluded independent of ordering',()=>{
  const rows=group(),bad={...rows[6],taiwanBusinessGroup:{...rows[6].taiwanBusinessGroup,id:'unknown'}};
  const a=buildTaiwanComparableMap([...rows,bad]),b=buildTaiwanComparableMap([bad,...rows]);
  assert.deepEqual(a.get('2451'),b.get('2451'));assert.equal(a.get('2451').peerCount,5);assert.equal(a.has(rows[6].ticker),false);
  for(const invalid of [null,{}]) {
    const plain=raw(),duplicate={...plain[0],taiwanBusinessGroup:invalid};
    const first=buildTaiwanComparableMap([duplicate,...plain]),last=buildTaiwanComparableMap([...plain,duplicate]);
    assert.equal(first.has('2451'),false);assert.equal(last.has('2451'),false);
    assert.deepEqual([...first],[...last]);
  }
});

test('business grouping never overrides heterogeneous/sales-margin or earnings review gates',()=>{
  const rows=group().map((s,i)=>i>=5?{...s,ebitPerShare:80,financialMetrics:{...s.financialMetrics,netIncomePerShare:50}}:s);
  const p=buildTaiwanComparableMap(rows).get('2451');assert.equal(p.psPeerCount,4);assert.equal(p.psMedian,null);assert.equal(p.evRevenueMedian,null);
  const shifted={...rows[0],eps:50,epsHistory:[{basis:'annual',end:'2025-12-31',value:3},{basis:'annual',end:'2024-12-31',value:2},{basis:'annual',end:'2023-12-31',value:1}]};
  assert.equal(value(shifted,p).valuationReviewRequired,true);
});

test('business opt-in is absent from legacy and US inputs and changes no legacy valuation',()=>{
  const s=stock('2451'),us={...s,market:'US'};
  assert.strictEqual(withTaiwanBusinessGroup(us),us);assert.deepEqual(calculateStock(withTaiwanBusinessGroup(s)).models,calculateStock(s).models);
});

test('audit hashes registry and writes a separate business comparison from frozen replay',async()=>{
  const source=await readFile(new URL('../scripts/audit-taiwan-models.mjs',import.meta.url),'utf8');
  assert.match(source,/modelFiles=\[[^\]]*'taiwan-business-groups\.ts'/);
  assert.match(source,/BUSINESS_COMPARISON_REQUIRES_FROZEN_REPLAY/);
  assert.match(source,/comparison-business-groups\.json/);
  const registry=await readFile(new URL('../lib/taiwan-business-groups.ts',import.meta.url),'utf8');
  assert.doesNotMatch(registry,/import .*value-reference|InvestingPro|VALUE_REFERENCES/);
});
