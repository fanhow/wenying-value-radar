import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {OFFICIAL_BOOK_SOURCES,parseOfficialBookCapture,compareTaiwanOfficialBook,
  fetchOfficialBookCaptures,summarizeOfficialBookAudit} from '../scripts/audit-taiwan-official-book.mjs';

const retrievedAt='2026-09-21T00:30:00.000Z';
function raw(board='TWSE',patch={}) {
  return {...(board==='TWSE'?{'出表日期':'1150921','公司代號':'1234','公司名稱':'測試公司'}:
    {Date:'1150921',SecuritiesCompanyCode:'5678',CompanyName:'測試上櫃'}),
  年度:'115',季別:'2','歸屬於母公司業主之權益合計':'2,000.00','每股參考淨值':'20.00',
  '非控制權益':'','庫藏股票':'-10.00',...patch};
}
function capture(board='TWSE',rows=[raw(board)],patch={}) {
  return {board,sourceURL:OFFICIAL_BOOK_SOURCES[board],retrievedAt,rawBody:JSON.stringify(rows),...patch};
}
function record(ticker='1234',board='TWSE',patch={}) {
  return {ticker,market:'TW',status:'ready',financialDate:'2026-06-30',fetchedAt:'2026-09-20T20:40:00.000Z',sources:['synthetic:vendor'],
    stock:{ticker,name:'測試公司',market:'TW',listingBoard:board,financialDataDate:'2026-06-30',updatedAt:'2026-09-18',
      bvps:22,eps:1,revenuePerShare:40,financialMetrics:{currency:'TWD',sharesOutstanding:100000}},...patch};
}
function fixture() {return [{observedAt:'2026-09-20T20:40:00.000Z',session:{date:'2026-09-18'},records:[record()]},[capture(),capture('TPEx')]];}
function audit(mutator=()=>{}) {const d=fixture();mutator(...d);return compareTaiwanOfficialBook(...d);}

test('both board schemas preserve raw units, blanks and distinct export/retrieval dates',()=>{
  for(const board of ['TWSE','TPEx']) {
    const c=capture(board),r=parseOfficialBookCapture(c),s=r.rows[0];
    assert.equal(r.counts.valid,1);assert.equal(s.reportedReferenceBVPS,20);assert.equal(s.parentEquityTwd,2000000);
    assert.equal(s.financialDate,'2026-06-30');assert.equal(s.exportDate,'2026-09-21');assert.equal(s.publishedDate,null);
    assert.equal(s.raw['非控制權益'],'');assert.equal(s.raw['庫藏股票'],'-10.00');assert.equal(s.retrievedAt,retrievedAt);
    assert.match(r.unitBasis.referenceBvpsDenominator,/not verified/);assert.equal(r.rawSha256.length,64);
  }
});
test('comparison preserves signed differences and explicitly derived equity without inferring shares',()=>{
  const result=audit(),c=result.rows[0].comparison;
  assert.ok(Math.abs(c.bvpsRelativeDifferencePct-10)<1e-10);assert.equal(c.bvpsDifference,2);
  assert.equal(c.vendorParentEquityTwd,2200000);assert.equal(c.parentEquityDifferenceTwd,200000);
  assert.match(c.vendorParentEquityBasis,/derived/);assert.equal(c.ordinaryBvpsEquivalenceVerified,false);
  assert.equal(Object.keys(c).some(k=>/shares/i.test(k)),false);
  assert.ok(audit(d=>{d.records[0].stock.bvps=18;}).rows[0].comparison.bvpsRelativeDifferencePct<0);
});
test('source namespace and retrieved instant fail closed',()=>{
  for(const patch of [{board:'US'},{sourceURL:OFFICIAL_BOOK_SOURCES.TPEx},{retrievedAt:'2026-02-30T00:00:00Z'},
    {retrievedAt:'not-a-date'},{retrievedAt:'2026-09-21'}, {rawBody:'{}'}])assert.throws(()=>parseOfficialBookCapture(capture('TWSE',undefined,patch)));
});
test('rows with another board schema cannot be joined',()=>{
  const r=parseOfficialBookCapture(capture('TPEx',[raw('TWSE')]));
  assert.equal(r.counts.valid,0);assert.ok(r.rows[0].reasons.includes('INVALID_OFFICIAL_ISSUER'));
});
test('ROC year and quarter map to exact quarter ends; malformed periods do not coerce',()=>{
  for(const [q,end] of [['1','2026-03-31'],['02','2026-06-30'],[3,'2026-09-30'],['4','2026-12-31']]) {
    const r=parseOfficialBookCapture(capture('TWSE',[raw('TWSE',{季別:q,出表日期:'1160102'})],{retrievedAt:'2027-01-02T12:00:00Z'}));
    assert.equal(r.rows[0].financialDate,end);assert.equal(r.counts.valid,1);
  }
  for(const patch of [{年度:'2026'},{年度:''},{年度:0},{季別:'5'},{季別:'2.5'},{季別:null}]) {
    const r=parseOfficialBookCapture(capture('TWSE',[raw('TWSE',patch)]));assert.equal(r.counts.valid,0);assert.ok(r.rows[0].reasons.includes('INVALID_OFFICIAL_PERIOD'));
  }
});
test('invalid calendar and contradictory export dates are rejected without publication-date claims',()=>{
  for(const value of ['1150230','1150630X','','1141231','1150922'])assert.equal(parseOfficialBookCapture(capture('TWSE',[raw('TWSE',{出表日期:value})])).counts.valid,0);
  const r=parseOfficialBookCapture(capture('TWSE',[raw()],{retrievedAt:'2026-09-20T17:00:00Z'}));
  assert.equal(r.counts.valid,1); // Taiwan is already September 21.
});
test('empty/non-finite/malformed numeric cells never become zero',()=>{
  for(const field of ['每股參考淨值','歸屬於母公司業主之權益合計'])for(const value of ['',null,'--','NaN','Infinity','1e9','2,00.00',true]) {
    const r=parseOfficialBookCapture(capture('TWSE',[raw('TWSE',{[field]:value})]));assert.equal(r.counts.valid,field==='每股參考淨值'?0:1);
    assert.equal(r.rows[0][field==='每股參考淨值'?'reportedReferenceBVPS':'parentEquityTwd'],null);
    if(field!=='每股參考淨值')assert.ok(r.rows[0].equityIssues.length>0);
  }
  for(const v of ['0','-1','20.001'])assert.equal(parseOfficialBookCapture(capture('TWSE',[raw('TWSE',{'每股參考淨值':v})])).counts.valid,0);
  const overflow=parseOfficialBookCapture(capture('TWSE',[raw('TWSE',{'歸屬於母公司業主之權益合計':1e308})]));
  assert.equal(overflow.counts.valid,1);assert.ok(overflow.rows[0].equityIssues.includes('INVALID_OFFICIAL_PARENT_EQUITY'));
});
test('exact and conflicting official duplicates invalidate every copy regardless of order',()=>{
  for(const conflicting of [false,true])for(const reverse of [false,true]) {
    const rows=[raw(),raw('TWSE',conflicting?{'每股參考淨值':'19.00'}:{})];if(reverse)rows.reverse();
    const c=capture('TWSE',rows),p=parseOfficialBookCapture(c);
    assert.equal(p.counts.valid,0);assert.ok(p.rows.every(r=>r.reasons.includes('DUPLICATE_OFFICIAL_KEY')));
    const r=compareTaiwanOfficialBook(fixture()[0],[c,capture('TPEx')]);assert.equal(r.coverage.compared,0);
    assert.ok(r.rows[0].reasons.includes('DUPLICATE_OFFICIAL_KEY'));
  }
});
test('different quarter or board for the same issuer never silently joins',()=>{
  const r=audit((d,c)=>{c[0]=capture('TWSE',[raw('TWSE',{季別:'1'})]);});
  assert.ok(r.rows[0].reasons.includes('NO_SAME_PERIOD_OFFICIAL_ROW'));assert.equal(r.coverage.compared,0);
  const cross=audit((d,c)=>{c[0]=capture('TWSE',[]);c[1]=capture('TPEx',[raw('TPEx',{SecuritiesCompanyCode:'1234'})]);});
  assert.ok(cross.rows[0].reasons.includes('OFFICIAL_BOARD_MISMATCH'));assert.equal(cross.coverage.compared,0);
});
test('only ready, positive BVPS, TWD and exact vendor identity/period records compare',()=>{
  const changes=[r=>{r.status='unavailable';},r=>{r.market='US';},r=>{r.stock.market='US';},
    r=>{r.stock.ticker='9999';},r=>{r.stock.listingBoard='UNKNOWN';},r=>{r.financialDate='2026-03-31';},
    r=>{r.stock.financialDataDate='2026-06-29';},r=>{r.stock.financialMetrics.currency='USD';},
    r=>{delete r.stock.financialMetrics.currency;},r=>{r.stock.bvps=0;},r=>{r.stock.bvps=NaN;},r=>{delete r.stock;}];
  for(const change of changes) {const r=audit(d=>change(d.records[0]));assert.equal(r.coverage.compared,0);assert.equal(r.rows[0].comparison,null);}
});
test('vendor duplicate keys fail closed even when one duplicate is unavailable',()=>{
  for(const first of [true,false]) {
    const r=audit(d=>{const duplicate=structuredClone(d.records[0]);duplicate.status='unavailable';d.records[first?'unshift':'push'](duplicate);});
    assert.equal(r.coverage.compared,0);assert.ok(r.rows.every(s=>s.reasons.includes('DUPLICATE_VENDOR_KEY')));
  }
});
test('two boards can have same issuer number without a duplicate collision',()=>{
  const r=audit((d,c)=>{d.records.push(record('1234','TPEx'));c[1]=capture('TPEx',[raw('TPEx',{SecuritiesCompanyCode:'1234'})]);});
  assert.equal(r.coverage.compared,2);assert.equal(r.coverage.officialMatched,2);
});
test('reported 2dp rounding is disclosed, not treated as exact ordinary BVPS equivalence',()=>{
  for(const [v,expected] of [[20.0049,true],[20.005,true],[20.0051,false],[19.995,true],[19.9949,false]]) {
    const c=audit(d=>{d.records[0].stock.bvps=v;}).rows[0].comparison;
    assert.equal(c.withinReference2dpRounding,expected);assert.equal(c.ordinaryBvpsEquivalenceVerified,false);
  }
});
test('missing/overflow shares affect equity diagnostics only, not otherwise valid BVPS comparison',()=>{
  for(const shares of [undefined,0,-1,Infinity,1e308]) {
    const r=audit(d=>{d.records[0].stock.financialMetrics.sharesOutstanding=shares;}),c=r.rows[0].comparison;
    assert.equal(r.coverage.compared,1);assert.equal(r.coverage.equityCompared,0);assert.equal(c.vendorParentEquityTwd,null);
    assert.ok(c.equityIssues.includes('MISSING_OR_NON_FINITE_VENDOR_EQUITY_DERIVATION'));
  }
});
test('zero official equity is preserved but cannot be a relative denominator',()=>{
  const r=audit((d,c)=>{c[0]=capture('TWSE',[raw('TWSE',{'歸屬於母公司業主之權益合計':'0.00'})]);});
  assert.equal(r.rows[0].comparison.officialParentEquityTwd,0);assert.equal(r.rows[0].comparison.parentEquityRelativeDifferencePct,null);
  assert.ok(r.rows[0].comparison.equityIssues.includes('ZERO_OFFICIAL_PARENT_EQUITY'));
});
test('numeric overflow cannot masquerade as compared JSON null',()=>{
  const r=audit((d,c)=>{d.records[0].stock.bvps=1e308;c[0]=capture('TWSE',[raw('TWSE',{'每股參考淨值':'0.01'})]);});
  assert.equal(r.coverage.compared,0);assert.ok(r.rows[0].reasons.includes('NON_FINITE_BVPS_COMPARISON'));
  assert.deepEqual(JSON.parse(JSON.stringify(r)),r);
});
test('coverage includes every input and every unmatched official row, not only positive outliers',()=>{
  const r=audit(d=>{d.records.push(record('9999'),record('5678','TPEx'));d.records[2].stock.bvps=10;});
  assert.equal(r.coverage.records,r.coverage.compared+r.coverage.unmatched);
  assert.equal(r.coverage.officialRows,r.coverage.officialMatched+r.coverage.officialUnmatched);
  assert.equal(r.coverage.compared,2);assert.equal(r.unmatchedReasonCounts.NO_OFFICIAL_ISSUER,1);
  assert.ok(r.rows.some(s=>s.comparison?.bvpsRelativeDifferencePct<0));
  assert.ok(r.rows.some(s=>s.comparison?.bvpsRelativeDifferencePct>0));
});
test('invalid official values retain raw evidence and an unmatched reason',()=>{
  const r=audit((d,c)=>{c[0]=capture('TWSE',[raw('TWSE',{'每股參考淨值':''})]);});
  assert.equal(r.coverage.compared,0);assert.equal(r.officialUnmatched.find(s=>s.board==='TWSE').raw['每股參考淨值'],'');
  assert.ok(r.rows[0].reasons.includes('OFFICIAL_INVALID_REFERENCE_BVPS'));
});
test('comparison is deterministic and leaves both inputs and production-like fields unchanged',()=>{
  const data=fixture(),before=structuredClone(data),a=compareTaiwanOfficialBook(...data),b=compareTaiwanOfficialBook(...data);
  assert.deepEqual(a,b);assert.deepEqual(data,before);
  const summary=summarizeOfficialBookAudit(a);assert.equal(JSON.stringify(summary).includes('rawBody'),false);
  assert.equal(summary.rows.length,a.rows.length);assert.equal(summary.rows[0].bvpsRelativeDifferencePct,a.rows[0].comparison.bvpsRelativeDifferencePct);
  assert.match(a.limitations.join(' '),/point-in-time/);
});
test('capture collection performs exactly two public requests without retries',async()=>{
  const calls=[];
  const captures=await fetchOfficialBookCaptures(async(url,options)=>{
    calls.push([url,options]);const board=url===OFFICIAL_BOOK_SOURCES.TWSE?'TWSE':'TPEx';
    return {ok:true,text:async()=>JSON.stringify([raw(board,{[board==='TWSE'?'出表日期':'Date']:'1140102',年度:'113',季別:'4'})])};
  });
  assert.equal(calls.length,2);assert.equal(captures.length,2);assert.ok(calls.every(([,o])=>o.signal instanceof AbortSignal));
});
test('HTTP, timeout and malformed response failures are explicit and do not fall back',async()=>{
  for(const fetcher of [async()=>({ok:false,status:503}),async()=>{throw new Error('TimeoutError');},async()=>({ok:true,text:async()=>'not-json'})]) {
    let calls=0;await assert.rejects(fetchOfficialBookCaptures(async(...args)=>{calls++;return fetcher(...args);}),/OFFICIAL_FETCH_FAILED/);assert.equal(calls,2);
  }
  await assert.rejects(fetchOfficialBookCaptures(async()=>{},0),/INVALID_TIMEOUT/);
});
test('one source per board is mandatory even when one table is empty',()=>{
  const [d,c]=fixture();for(const captures of [[],[c[0]],[c[0],c[0]]])assert.throws(()=>compareTaiwanOfficialBook(d,captures),/REQUIRE_ONE_CAPTURE_PER_BOARD/);
  assert.equal(compareTaiwanOfficialBook(d,[capture('TWSE',[]),capture('TPEx',[])]).coverage.compared,0);
});
test('HTTP 200 empty arrays fail closed at capture acquisition',async()=>{
  let calls=0;
  await assert.rejects(fetchOfficialBookCaptures(async()=>{calls++;return {ok:true,text:async()=>'[]'};}),/EMPTY_OFFICIAL_ROWS/);
  assert.equal(calls,2);
});
test('reference BVPS requires raw decimal precision and safe exact cents, without epsilon acceptance',()=>{
  for(const value of ['0.0000000001','20.0000000001','20.000',1e308,'90071992547409.92','90071992547409.91']) {
    const r=parseOfficialBookCapture(capture('TWSE',[raw('TWSE',{'每股參考淨值':value})]));
    assert.equal(r.counts.valid,0,String(value));assert.equal(r.rows[0].reportedReferenceBVPS,null);
  }
  for(const value of ['1.15','0.01','1,234.56',1.15]) {
    const r=parseOfficialBookCapture(capture('TWSE',[raw('TWSE',{'每股參考淨值':value})]));
    assert.equal(r.counts.valid,1,String(value));assert.ok(Number.isFinite(r.rows[0].reportedReferenceBVPS));
  }
});
test('vendor canonical ticker is shared by identity, lookup and duplicate checks',()=>{
  const single=audit(d=>{d.records[0].ticker=' 1234 ';});
  assert.equal(single.coverage.compared,1);assert.equal(single.rows[0].ticker,'1234');
  for(const reverse of [false,true]) {
    const r=audit(d=>{d.records.push(record(' 1234 '));if(reverse)d.records.reverse();});
    assert.equal(r.coverage.compared,0);assert.ok(r.rows.every(s=>s.reasons.includes('DUPLICATE_VENDOR_KEY')));
  }
});
test('parent-equity absence does not erase reference BVPS or fall back to total equity',()=>{
  for(const value of ['',null,'NaN',1e308]) {
    const r=audit((d,c)=>{c[0]=capture('TWSE',[raw('TWSE',{'歸屬於母公司業主之權益合計':value,'權益總計':'999999.00'})]);});
    assert.equal(r.auditVersion,'taiwan-official-book-v2');assert.equal(r.coverage.compared,1);
    assert.equal(r.coverage.referenceCompared,1);assert.equal(r.coverage.equityCompared,0);
    assert.equal(r.coverage.referenceComparedWithEquityUnavailable,1);
    const c=r.rows[0].comparison;assert.equal(c.reportedReferenceBVPS,20);assert.equal(c.officialParentEquityTwd,null);
    assert.equal(c.parentEquityDifferenceTwd,null);assert.equal(c.parentEquityRelativeDifferencePct,null);assert.ok(c.equityIssues.length>0);
    assert.equal(r.rows[0].official.raw['歸屬於母公司業主之權益合計'],value);
    assert.equal(r.rows[0].official.raw['權益總計'],'999999.00');
    assert.ok(summarizeOfficialBookAudit(r).rows[0].equityIssues.length>0);
  }
});
test('ready coverage means Taiwan ready records, not unrelated US records',()=>{
  const r=audit(d=>{const us=record('1234');us.market='US';us.stock.market='US';d.records.push(us);});
  assert.equal(r.coverage.records,2);assert.equal(r.coverage.taiwan,1);assert.equal(r.coverage.ready,1);
  assert.equal(r.coverage.referenceCompared,1);assert.equal(r.coverage.equityCompared,1);
});
test('underflowing vendor equity derivation is unavailable, not a fabricated zero',()=>{
  const r=audit(d=>{d.records[0].stock.bvps=.01;d.records[0].stock.financialMetrics.sharesOutstanding=Number.MIN_VALUE;});
  assert.equal(r.coverage.compared,1);assert.equal(r.coverage.equityCompared,0);
  assert.equal(r.rows[0].comparison.vendorParentEquityTwd,null);assert.equal(r.rows[0].comparison.parentEquityDifferenceTwd,null);
  assert.ok(r.rows[0].comparison.equityIssues.length>0);
});
test('CLI offline replay saves complete raw capture without overwriting an existing file',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'wenying-official-book-test-'));
  try {
    const [input,captures]=fixture(),inputPath=join(directory,'input.json'),replayPath=join(directory,'capture.json'),out=join(directory,'result.json');
    await writeFile(inputPath,JSON.stringify(input));await writeFile(replayPath,JSON.stringify({captureVersion:'taiwan-official-book-capture-v1',captures}));
    const script=fileURLToPath(new URL('../scripts/audit-taiwan-official-book.mjs',import.meta.url));
    const args=[script,'--input',inputPath,'--replay',replayPath,'--out',out];
    const result=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    const summary=JSON.parse(result.stdout),saved=JSON.parse(await readFile(out,'utf8'));
    assert.equal(saved.audit.auditVersion,'taiwan-official-book-v2');
    assert.equal(summary.coverage.compared,1);assert.equal(summary.captures,undefined);assert.deepEqual(saved.captures,captures);
    assert.equal(saved.audit.rows[0].official.raw['每股參考淨值'],'20.00');assert.equal(saved.audit.provenance.inputSha256.length,64);
    const second=spawnSync(process.execPath,args,{encoding:'utf8'});assert.notEqual(second.status,0);assert.match(second.stderr,/EEXIST/);
    await writeFile(replayPath,JSON.stringify({captureVersion:'taiwan-official-book-capture-v1',captures:[capture('TWSE',[]),capture('TPEx')]}));
    const empty=spawnSync(process.execPath,[script,'--input',inputPath,'--replay',replayPath],{encoding:'utf8'});
    assert.notEqual(empty.status,0);assert.match(empty.stderr,/EMPTY_OFFICIAL_ROWS/);
    assert.deepEqual(JSON.parse(await readFile(out,'utf8')),saved); // Prior artifact remains untouched.
  } finally {await rm(directory,{recursive:true,force:true});}
});
