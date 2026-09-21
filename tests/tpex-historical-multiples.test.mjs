import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {HISTORY_YEARS,summarizeOwnHistorySources} from '../scripts/study-taiwan-historical-multiples.mjs';
import {TPEX_HISTORY_PROTOCOL_SHA,TPEX_HISTORY_AMENDMENT_SHA,TPEX_HISTORY_ISSUERS,TPEX_HISTORY_URL,tpexHistoryRequestBody,
  parseTpexHistoryCapture,studyTpexHistoricalMultiples,captureTpexHistory} from '../scripts/study-tpex-historical-multiples.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(ticker='1580',year=2025,mutate=()=>{}) {
  const name=TPEX_HISTORY_ISSUERS.find(i=>i.ticker===ticker).name;
  const b={stat:'ok',date:`${year}1201`,tables:[{
    title:'上櫃股票個股本益比、殖利率、股價淨值比(依代碼查詢)',date:`${year-1911}年12月`,subtitle:`${ticker} ${name}  ${year-1911}年12月`,
    fields:['日期','本益比','殖利率(%)','股利年度','股價淨值比','財報年/季'],
    data:[[''+(year-1911)+'/12/01','10','3.1',year-1912,'2',`${year-1911}Q3`],
      [''+(year-1911)+'/12/30','12','3.2',year-1912,'2.5',`${year-1911}Q3`]],totalCount:2,
    notes:['Synthetic method note; not real financial evidence.'],summary:[]},
    {title:'',fields:['股利所屬年度','199'],data:[['每股股利',999]],notes:['future auxiliary content'],totalCount:1}]};
  mutate(b);const rawBody=JSON.stringify(b);
  return {ticker,year,board:'TPEx',sourceURL:TPEX_HISTORY_URL,httpMethod:'POST',requestBody:tpexHistoryRequestBody(ticker,year),
    retrievedAt:'2026-09-21T02:00:00.000Z',httpStatus:200,rawBody,rawSha256:sha(rawBody),error:null};
}
const parse=(mutate,patch={})=>parseTpexHistoryCapture({...fixture('1580',2025,mutate),...patch});
test('TPEx protocol byte hash fixed, only 1580/8183 and five preselected years allowed',()=>{
  assert.equal(sha(readFileSync(new URL('../docs/tpex-historical-multiples-protocol-20260921.md',import.meta.url))),TPEX_HISTORY_PROTOCOL_SHA);
  assert.equal(tpexHistoryRequestBody('1580',2025),'date=2025%2F12%2F01&code=1580&response=json');
  for(const ticker of ['6176','8213','01580'])assert.throws(()=>tpexHistoryRequestBody(ticker,2025));
  for(const year of [2020,2026,'2025'])assert.throws(()=>tpexHistoryRequestBody('1580',year));
});
test('primary table preserves original source notes but excludes future dividend auxiliary',()=>{
  const r=parse();assert.deepEqual(r.reasons,[]);assert.equal(r.selected.observationDate,'2025-12-30');
  assert.equal(r.selected.financialPeriodEnd,'2025-09-30');assert.equal(r.selected.rawFinancialPeriod,'114Q3');
  assert.equal(r.rows.length,2);assert.equal(r.ignoredAuxiliaryTables,1);assert.equal(r.publishedAt,null);
  assert.equal(r.noBackRevisionPromise,'not verified');assert.equal(r.actualCloseVersusSubstitute,'unknown');
  assert.equal(r.methodNotes.length,1);assert.equal(r.selected.pe.value,12);assert.equal(r.selected.pb.value,2.5);
  assert.ok(!JSON.stringify(r).includes('999'));
});
test('POST identity/source/time/hash validation fails closed',()=>{
  for(const patch of [{board:'TWSE'},{httpMethod:'GET'},{sourceURL:TPEX_HISTORY_URL+'?code=1580'},
    {requestBody:'date=2025%2F12%2F01&code=8183&response=json'},{requestBody:tpexHistoryRequestBody('1580',2025)+'&code=1580'},
    {retrievedAt:'2025-12-31T02:00:00.000Z'},{retrievedAt:'2026-02-30T00:00:00.000Z'}, {rawSha256:'bad'},{rawBody:[]}])assert.throws(()=>parse(undefined,patch));
});
test('wrong month, table name, issuer, duplicate primary table or row count invalidates capture',()=>{
  for(const change of [b=>{b.date='20251101';},b=>{b.tables[0].date='113年12月';},b=>{b.tables[0].subtitle='8183 精星 114年12月';},
    b=>{b.tables[0].title='dividends';},b=>{b.tables.push(b.tables[0]);},b=>{b.tables[0].totalCount=3;},b=>{b.tables=[];}]) {
    const r=parse(change);assert.equal(r.selected,null);assert.ok(r.reasons.length);
  }
});
test('schema validation and exact field-name mapping do not assume TWSE column order',()=>{
  const shuffled=parse(b=>{const t=b.tables[0];t.fields.reverse();t.data.forEach(r=>r.reverse());});
  assert.equal(shuffled.selected.pe.value,12);assert.equal(shuffled.selected.pb.value,2.5);
  for(const change of [b=>{b.tables[0].fields[1]='日期';},b=>{b.tables[0].fields.pop();},b=>{b.tables[0].notes=[];},
    b=>{b.tables[0].notes=[null];},b=>{b.tables[0].data[0].pop();}])assert.equal(parse(change).selected,null);
});
test('ROC dates and financial quarters reject invalid, future, duplicate and wrong formats',()=>{
  for(const rawDate of ['114/12/32','114/11/30','113/12/30','114年12月30日'])assert.equal(parse(b=>{b.tables[0].data[0][0]=rawDate;}).selected,null);
  assert.equal(parse(b=>{b.tables[0].data[0][0]=b.tables[0].data[1][0];}).selected,null);
  for(const q of ['','114/3','114Q0','114Q4','115Q1'])assert.equal(parse(b=>{b.tables[0].data[1][5]=q;}).selected,null);
});
test('last date chosen even when PE/PB missing; zero and negative values never fill',()=>{
  const r=parse(b=>{b.tables[0].data[1][1]='--';b.tables[0].data[1][4]='0';b.tables[0].data.reverse();});
  assert.equal(r.selected.observationDate,'2025-12-30');assert.equal(r.selected.pe.reason,'SOURCE_MISSING_MARKER');
  assert.equal(r.selected.pb.reason,'ZERO_MULTIPLE');assert.equal(r.selected.pe.value,null);
  assert.equal(parse(b=>{b.tables[0].data[1][1]='-1';}).selected.pe.reason,'NEGATIVE_MULTIPLE');
});
test('HTTP, body-read, official no-data and empty-response conditions stay separate',()=>{
  assert.deepEqual(parse(undefined,{httpStatus:429}).reasons,['HTTP_FAILURE']);
  assert.deepEqual(parse(undefined,{httpStatus:null,error:'TypeError',rawBody:null,rawSha256:null}).reasons,['NETWORK_FAILURE']);
  const r=parse(undefined,{error:'TimeoutError',rawBody:null,rawSha256:null});assert.equal(r.transportError,'TimeoutError');assert.deepEqual(r.reasons,['BODY_READ_FAILURE']);
  assert.deepEqual(parse(undefined,{rawBody:null,rawSha256:null}).reasons,['MISSING_RESPONSE_BODY']);
  assert.deepEqual(parse(undefined,{rawBody:'<html>',rawSha256:sha('<html>')}).reasons,['INVALID_JSON']);
  assert.deepEqual(parse(b=>{b.stat='查無資料';}).reasons,['SOURCE_NOT_OK']);
});
test('ten fixed cells persist; per-metric coverage and full-five median are independent',()=>{
  const empty=studyTpexHistoricalMultiples([]);assert.equal(empty.rows.flatMap(r=>r.years).length,10);
  const captures=HISTORY_YEARS.map((year,i)=>fixture('1580',year,b=>{b.tables[0].data[1][1]=i<3?String(i+10):'--';b.tables[0].data[1][4]=String(i+1);}));
  const r=studyTpexHistoricalMultiples(captures).rows[0];assert.equal(r.pe.validPositiveYears,3);assert.equal(r.pe.positiveYearsDescriptiveMedian,11);
  assert.equal(r.pe.completeFiveYearMedian,null);assert.equal(r.pb.completeFiveYearMedian,3);assert.deepEqual(r.pe.usedYears,[2021,2022,2023]);
});
test('duplicates rejected, order stable, no input mutation and summaries cannot mix boards',()=>{
  const cs=TPEX_HISTORY_ISSUERS.flatMap(i=>HISTORY_YEARS.map(y=>fixture(i.ticker,y))),before=JSON.stringify(cs);
  const result=studyTpexHistoricalMultiples(cs);assert.deepEqual(studyTpexHistoricalMultiples([...cs].reverse()),result);assert.equal(JSON.stringify(cs),before);
  assert.throws(()=>studyTpexHistoricalMultiples([...cs,cs[0]]),/DUPLICATE_CAPTURE/);
  assert.throws(()=>summarizeOwnHistorySources([parseTpexHistoryCapture(cs[0])],TPEX_HISTORY_ISSUERS,'TWSE'),/SCOPE_MISMATCH/);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),result);
});
test('collector is bounded to ten POST form requests and preserves timeout failures',async()=>{
  const requests=[];const bundle=await captureTpexHistory(async(url,options)=>{
    requests.push({url,options});if(requests.length===1)throw new TypeError('offline');
    return {status:200,text:async()=>{const e=new Error('timeout');e.name='TimeoutError';throw e;}};
  });
  assert.equal(requests.length,10);assert.ok(requests.every(r=>r.url===TPEX_HISTORY_URL&&r.options.method==='POST'));
  assert.ok(requests.every(r=>r.options.headers['content-type']==='application/x-www-form-urlencoded'&&r.options.redirect==='error'));
  assert.deepEqual(parseTpexHistoryCapture(bundle.captures[0]).reasons,['NETWORK_FAILURE']);
  assert.deepEqual(parseTpexHistoryCapture(bundle.captures[1]).reasons,['BODY_READ_FAILURE']);
  assert.equal(bundle.protocolSha256,TPEX_HISTORY_PROTOCOL_SHA);
});

const fiveFields=b=>{b.tables[0].fields.pop();b.tables[0].data.forEach(r=>r.pop());};
test('legacy amendment hash fixed; strict replay retains its original behavior',()=>{
  assert.equal(sha(readFileSync(new URL('../docs/tpex-historical-multiples-schema-amendment-20260921.md',import.meta.url))),TPEX_HISTORY_AMENDMENT_SHA);
  const c=fixture('1580',2021,fiveFields);
  assert.deepEqual(parseTpexHistoryCapture(c).reasons,['INVALID_FIELDS']);
  assert.equal(studyTpexHistoricalMultiples([c]).rows[0].pb.validPositiveYears,0);
  for(const value of [null,1,'true'])assert.throws(()=>parseTpexHistoryCapture(c,{allowLegacyFiveFields:value}),/SCHEMA_POLICY/);
});
test('only amended five-field schema accepts unknown quarter without inventing one',()=>{
  const c=fixture('1580',2021,fiveFields),r=parseTpexHistoryCapture(c,{allowLegacyFiveFields:true});
  assert.deepEqual(r.reasons,[]);assert.equal(r.selected.observationDate,'2021-12-30');
  assert.equal(r.selected.financialPeriodEnd,null);assert.equal(r.selected.rawFinancialPeriod,null);
  assert.deepEqual(r.warnings,['FINANCIAL_PERIOD_NOT_PUBLISHED_IN_LEGACY_SCHEMA']);
  assert.equal(r.schema,'legacy-five-fields');assert.equal(r.selected.pb.value,2.5);
  const reordered=fixture('8183',2022,b=>{fiveFields(b);b.tables[0].fields.reverse();b.tables[0].data.forEach(r=>r.reverse());});
  assert.equal(parseTpexHistoryCapture(reordered,{allowLegacyFiveFields:true}).selected.pb.value,2.5);
});
test('amended schema does not excuse malformed quarters, arbitrary removed columns or mismatched widths',()=>{
  for(const change of [b=>{b.tables[0].data[1][5]='';},b=>{b.tables[0].data[1][5]='115Q1';},
    b=>{b.tables[0].fields.splice(1,1);b.tables[0].data.forEach(r=>r.splice(1,1));},
    b=>{fiveFields(b);b.tables[0].fields[4]='unexpected';},
    b=>{fiveFields(b);b.tables[0].data[0].push('extra');},
    b=>{fiveFields(b);b.tables[0].data[0][0]='114/12/32';}]) {
    assert.equal(parseTpexHistoryCapture(fixture('1580',2025,change),{allowLegacyFiveFields:true}).selected,null);
  }
});
test('amended summary separates ratio coverage from unknown financial periods and preserves no-fallback policy',()=>{
  const cs=HISTORY_YEARS.map(y=>fixture('1580',y,b=>{if(y<2025)fiveFields(b);}));
  const r=studyTpexHistoricalMultiples(cs,{allowLegacyFiveFields:true});
  assert.equal(r.schemaAmendmentSha256,TPEX_HISTORY_AMENDMENT_SHA);assert.equal(r.rows[0].pb.completeFiveYearMedian,2.5);
  assert.deepEqual(r.rows[0].financialPeriodCoverage,{selectedObservations:5,knownPeriods:1,unknownPeriodYears:[2021,2022,2023,2024]});
  const missing=fixture('1580',2021,b=>{fiveFields(b);b.tables[0].data[1][4]='--';});
  const selected=parseTpexHistoryCapture(missing,{allowLegacyFiveFields:true}).selected;
  assert.equal(selected.observationDate,'2021-12-30');assert.equal(selected.pb.value,null);
  assert.deepEqual(studyTpexHistoricalMultiples([...cs].reverse(),{allowLegacyFiveFields:true}),r);
});
