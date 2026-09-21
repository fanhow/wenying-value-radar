import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {HISTORY_YEARS,HISTORY_ISSUERS,HISTORY_PROTOCOL_SHA,historicalRequestUrl,parsePublishedMultiple,
  parseHistoricalCapture,studyHistoricalMultiples,captureHistoricalMultiples} from '../scripts/study-taiwan-historical-multiples.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
function fixture(ticker='6176',year=2025,mutate=()=>{}) {
  const issuer=HISTORY_ISSUERS.find(i=>i.ticker===ticker);
  const data={stat:'OK',date:`${year}1231`,title:`${year-1911}年12月 ${issuer.name}             個股日本益比、殖利率及股價淨值比(以個股月查詢)`,
    fields:['日期','殖利率(%)','股利年度','本益比','股價淨值比','財報年/季'],total:2,
    data:[[`${year-1911}年12月01日`,'4.5',year-1912,'10','1.2',`${year-1911}/3`],
      [`${year-1911}年12月30日`,'4.5',year-1912,'12','1.5',`${year-1911}/3`]]};
  mutate(data);
  const rawBody=JSON.stringify(data);
  return {ticker,year,board:'TWSE',sourceURL:historicalRequestUrl(ticker,year),retrievedAt:'2026-09-21T01:00:00.000Z',
    httpStatus:200,rawBody,rawSha256:sha(rawBody),error:null};
}
const parse=(mutate,patch={})=>parseHistoricalCapture({...fixture('6176',2025,mutate),...patch});
const captureSet=()=>HISTORY_ISSUERS.flatMap(i=>HISTORY_YEARS.map(y=>fixture(i.ticker,y)));

test('protocol has exact fixed hash and sample; unsupported issuers cannot make requests',()=>{
  assert.equal(sha(readFileSync(new URL('../docs/taiwan-historical-multiples-protocol-20260921.md',import.meta.url))),HISTORY_PROTOCOL_SHA);
  assert.deepEqual(HISTORY_ISSUERS.map(x=>x.ticker),['6176','8213','3592']);
  for(const ticker of ['1580','8183','US','06176'])assert.throws(()=>historicalRequestUrl(ticker,2025));
  for(const year of [2020,2026,'2025'])assert.throws(()=>historicalRequestUrl('6176',year));
});
test('preserves original row, date, reported financial quarter and unknown publication basis',()=>{
  const r=parse(),s=r.selected;
  assert.deepEqual(r.reasons,[]);assert.equal(s.observationDate,'2025-12-30');assert.equal(s.financialPeriodEnd,'2025-09-30');
  assert.equal(s.rawFinancialPeriod,'114/3');assert.equal(s.raw[3],'12');assert.equal(r.publishedAt,null);
  assert.equal(r.actualCloseVersusSubstitute,'unknown');assert.match(r.sourceInstrumentEcho,/not echoed/);
});
test('selects last date before validating PE or PB; no fallback to an earlier good number',()=>{
  const r=parse(d=>{d.data[1][3]='--';d.data.reverse();});
  assert.equal(r.selected.observationDate,'2025-12-30');assert.equal(r.selected.pe.value,null);
  assert.equal(r.selected.pe.reason,'SOURCE_MISSING_MARKER');assert.equal(r.selected.pb.value,1.5);
});
test('multiple parser preserves missing, markers, zeros, negative and malformed distinctions',()=>{
  for(const value of [null,undefined,'',' '])assert.equal(parsePublishedMultiple(value).reason,'MISSING_MULTIPLE');
  for(const value of ['--','-','N/A'])assert.equal(parsePublishedMultiple(value).reason,'SOURCE_MISSING_MARKER');
  for(const value of [0,'0','-0'])assert.equal(parsePublishedMultiple(value).reason,'ZERO_MULTIPLE');
  for(const value of [-1,'-2.5'])assert.equal(parsePublishedMultiple(value).reason,'NEGATIVE_MULTIPLE');
  for(const value of ['1e2','0x10','5%','1,00','NA',true,[],Infinity,NaN])assert.equal(parsePublishedMultiple(value).reason,'UNPARSEABLE_OR_NON_FINITE_MULTIPLE');
  for(const [raw,value] of [['1,234.56',1234.56],['+10.5',10.5],[1.2,1.2]])assert.equal(parsePublishedMultiple(raw).value,value);
});
test('source, time, board, raw hash and unsupported identities fail closed',()=>{
  for(const patch of [{board:'TPEx'},{sourceURL:'https://example.com'}, {retrievedAt:'2026-02-30T00:00:00.000Z'},
    {retrievedAt:'2025-12-31T00:00:00.000Z'},{rawSha256:'bad'},{rawBody:{}}])assert.throws(()=>parse(undefined,patch));
});
test('HTTP failures, invalid JSON and source error remain distinct missing captures',()=>{
  assert.deepEqual(parse(undefined,{httpStatus:429}).reasons,['HTTP_FAILURE']);
  assert.deepEqual(parse(undefined,{httpStatus:null,rawBody:null,rawSha256:null}).reasons,['NETWORK_FAILURE']);
  assert.deepEqual(parse(undefined,{rawBody:'<html>',rawSha256:sha('<html>')}).reasons,['INVALID_JSON']);
  assert.deepEqual(parse(d=>{d.stat='查無資料';}).reasons,['SOURCE_NOT_OK']);
});
test('HTTP headers followed by body read failure do not masquerade as official no-data',async()=>{
  const bundle=await captureHistoricalMultiples(async()=>({status:200,text:async()=>{const e=new Error('body timeout');e.name='TimeoutError';throw e;}}));
  const parsed=parseHistoricalCapture(bundle.captures[0]);
  assert.equal(parsed.httpStatus,200);assert.equal(parsed.transportError,'TimeoutError');
  assert.deepEqual(parsed.reasons,['BODY_READ_FAILURE']);assert.equal(parsed.selected,null);
  assert.deepEqual(parse(undefined,{rawBody:null,rawSha256:null}).reasons,['MISSING_RESPONSE_BODY']);
  assert.deepEqual(parse(undefined,{rawBody:' ',rawSha256:sha(' ')}).reasons,['MISSING_RESPONSE_BODY']);
});
test('wrong source year, name, schema, row count and duplicate fields invalidate month',()=>{
  for(const mutate of [d=>{d.date='20241231';},d=>{d.title=d.title.replace('瑞儀','瑞鼎');},
    d=>{d.fields[2]='other';},d=>{d.fields[3]='日期';},d=>{d.total=3;},d=>{d.data={};}]) {
    const r=parse(mutate);assert.equal(r.selected,null);assert.ok(r.reasons.length);
  }
});
test('field reordering is supported by exact names and does not change selected values',()=>{
  const before=parse(),after=parse(d=>{d.fields.reverse();d.data=d.data.map(r=>r.reverse());});
  assert.deepEqual(after.selected.pe,before.selected.pe);assert.deepEqual(after.selected.pb,before.selected.pb);
  assert.equal(after.selected.observationDate,before.selected.observationDate);
});
test('malformed row, impossible/out-of-month date, duplicate date invalidate whole month',()=>{
  for(const mutate of [d=>{d.data[0]=null;},d=>{d.data[0].pop();},d=>{d.data[0][0]='114年12月32日';},
    d=>{d.data[0][0]='114年11月30日';},d=>{d.data[0][0]='113年12月30日';},d=>{d.data[0][0]=d.data[1][0];}]) {
    const r=parse(mutate);assert.equal(r.selected,null);assert.ok(r.reasons.length);
  }
});
test('unknown/future financial quarter invalidates month rather than inventing FY EPS',()=>{
  for(const period of ['',null,'114/5','114/4','115/1']) {
    const r=parse(d=>{d.data[1][5]=period;});assert.equal(r.selected,null);assert.ok(r.reasons.length);
  }
});
test('all 15 cells retained, two TPEx names explicit, no valuation fields',()=>{
  const r=studyHistoricalMultiples([]);assert.equal(r.rows.length,3);assert.equal(r.rows.flatMap(x=>x.years).length,15);
  assert.deepEqual(r.unsupported.map(x=>x.ticker),['1580','8183']);
  for(const row of r.rows) {assert.equal(row.pe.status,'unavailable');assert.equal(row.pe.positiveYearsDescriptiveMedian,null);}
  const scan=value=>{if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)) {
    assert.ok(!/^(fairValue|upside|selectedMultiple|eps|bvps)$/i.test(k));scan(v);
  }};scan(r);
});
test('PE and PB have independent coverage; complete median requires all five',()=>{
  const cs=HISTORY_YEARS.map((year,i)=>fixture('6176',year,d=>{d.data[1][3]=i<3?String(10+i):'--';d.data[1][4]=i<2?'--':String(i);}));
  const r=studyHistoricalMultiples(cs).rows[0];assert.equal(r.pe.validPositiveYears,3);assert.equal(r.pb.validPositiveYears,3);
  assert.deepEqual(r.pe.usedYears,[2021,2022,2023]);assert.deepEqual(r.pb.usedYears,[2023,2024,2025]);
  assert.equal(r.pe.positiveYearsDescriptiveMedian,11);assert.equal(r.pb.positiveYearsDescriptiveMedian,3);
  assert.equal(r.pe.completeFiveYearMedian,null);assert.equal(r.pb.completeFiveYearMedian,null);
});
test('descriptive median supports odd/even/one coverage without numerical overflow or zero fill',()=>{
  for(const [values,expected] of [[[1,3],2],[[1,2,7],2],[[Number.MAX_VALUE,Number.MAX_VALUE],Number.MAX_VALUE],[[Number.MIN_VALUE],Number.MIN_VALUE]]) {
    const r=studyHistoricalMultiples(values.map((v,i)=>fixture('6176',HISTORY_YEARS[i],d=>{d.data[1][3]=v;}))).rows[0];
    assert.equal(r.pe.positiveYearsDescriptiveMedian,expected);assert.equal(r.pe.completeFiveYearMedian,null);
  }
  assert.equal(studyHistoricalMultiples(captureSet()).rows[0].pe.completeFiveYearMedian,12);
});
test('capture ordering stable, duplicates rejected, extra current inputs do not alter history',()=>{
  const captures=captureSet(),before=JSON.stringify(captures),r=studyHistoricalMultiples(captures);
  assert.deepEqual(studyHistoricalMultiples([...captures].reverse()),r);assert.equal(JSON.stringify(captures),before);
  assert.throws(()=>studyHistoricalMultiples([...captures,captures[0]]),/DUPLICATE_CAPTURE/);
  assert.deepEqual(studyHistoricalMultiples(captures.map(c=>({...c,eps:99,peers:[999],shares:1}))),r);
  assert.deepEqual(JSON.parse(JSON.stringify(r)),r);
});
test('collector sends exactly 15 allowed requests and retains individual HTTP/network failures',async()=>{
  const urls=[],progress=[];
  const bundle=await captureHistoricalMultiples(async url=>{
    urls.push(url);if(urls.length===1)throw new TypeError('offline');
    return {status:urls.length===2?429:200,text:async()=>'{"stat":"no data"}'};
  },info=>progress.push(info));
  assert.equal(urls.length,15);assert.equal(progress.length,15);assert.ok(urls.every(u=>!u.includes('1580')&&!u.includes('8183')));
  assert.equal(bundle.captures[0].httpStatus,null);assert.equal(bundle.captures[0].rawBody,null);
  assert.equal(bundle.captures[1].httpStatus,429);assert.equal(bundle.protocolSha256,HISTORY_PROTOCOL_SHA);
  assert.equal(studyHistoricalMultiples(bundle.captures).rows[0].pe.validPositiveYears,0);
});
