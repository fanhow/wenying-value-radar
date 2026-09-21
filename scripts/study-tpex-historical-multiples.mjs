// Separate official TPEx adapter; no production import, EPS inference or valuation.
import {readFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {HISTORY_YEARS,parsePublishedMultiple,summarizeOwnHistorySources} from './study-taiwan-historical-multiples.mjs';

export const TPEX_HISTORY_PROTOCOL_SHA='33f33235799838ae7b40a0c1f377937022bdbb0bd83c976942f58d4178facdba';
export const TPEX_HISTORY_AMENDMENT_SHA='bff7bcb7f4c5aae4a4a7c832f5df37e79a7c30b36dbaf418c1bd9bf849aa8dbc';
export const TPEX_HISTORY_URL='https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryStock';
export const TPEX_HISTORY_ISSUERS=Object.freeze([Object.freeze({ticker:'1580',name:'新麥'}),Object.freeze({ticker:'8183',name:'精星'})]);
const METHOD_URL='https://www.tpex.org.tw/zh-tw/mainboard/trading/info/stock-pe.html';
const TITLE='上櫃股票個股本益比、殖利率、股價淨值比(依代碼查詢)';
const FIELDS=['日期','本益比','殖利率(%)','股利年度','股價淨值比','財報年/季'];
const sha=v=>createHash('sha256').update(v).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const normal=v=>typeof v==='string'?v.trim().replace(/\s+/g,' '):'';
const date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))
  &&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const instant=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(d)
  &&Number.isFinite(Date.parse(d))&&new Date(d).toISOString()===d;
function issuerFor(ticker,year) {
  const issuer=TPEX_HISTORY_ISSUERS.find(i=>i.ticker===ticker);
  if(!issuer||!HISTORY_YEARS.includes(year))throw new Error('OUTSIDE_FIXED_TPEX_PROTOCOL');return issuer;
}
export function tpexHistoryRequestBody(ticker,year) {
  issuerFor(ticker,year);return new URLSearchParams({date:`${year}/12/01`,code:ticker,response:'json'}).toString();
}
function rocDate(raw) {
  const m=typeof raw==='string'?/^(\d{2,3})\/(\d{2})\/(\d{2})$/.exec(raw.trim()):null;
  const d=m?`${Number(m[1])+1911}-${m[2]}-${m[3]}`:null;return date(d)?d:null;
}
function quarter(raw) {
  const m=typeof raw==='string'?/^(\d{2,3})Q([1-4])$/.exec(raw.trim()):null;
  return m?`${Number(m[1])+1911}-${['03-31','06-30','09-30','12-31'][Number(m[2])-1]}`:null;
}
export function parseTpexHistoryCapture(capture,{allowLegacyFiveFields=false}={}) {
  if(typeof allowLegacyFiveFields!=='boolean')throw new Error('INVALID_SCHEMA_POLICY');
  if(!object(capture))throw new Error('INVALID_CAPTURE');
  const issuer=issuerFor(capture.ticker,capture.year);
  if(capture.board!=='TPEx'||capture.sourceURL!==TPEX_HISTORY_URL||capture.httpMethod!=='POST'
    ||capture.requestBody!==tpexHistoryRequestBody(capture.ticker,capture.year))throw new Error('CAPTURE_IDENTITY_MISMATCH');
  if(!instant(capture.retrievedAt)||capture.year>=Number(capture.retrievedAt.slice(0,4)))throw new Error('INVALID_CAPTURE_TIME_OR_UNCOMPLETED_YEAR');
  if(capture.rawBody!==null&&typeof capture.rawBody!=='string')throw new Error('INVALID_RAW_BODY');
  const hash=capture.rawBody===null?null:sha(capture.rawBody);
  if(capture.rawSha256!==hash)throw new Error('RAW_HASH_MISMATCH');
  const out={...issuer,board:'TPEx',year:capture.year,sourceURL:capture.sourceURL,httpMethod:'POST',requestBody:capture.requestBody,
    retrievedAt:capture.retrievedAt,httpStatus:capture.httpStatus,rawSha256:hash,publishedAt:null,
    methodSource:METHOD_URL,sourceInstrumentEcho:'code and company name in subtitle',
    actualCloseVersusSubstitute:'unknown',noBackRevisionPromise:'not verified',rows:[],selected:null,reasons:[]};
  if(capture.error!==null&&capture.error!==undefined) {
    if(typeof capture.error!=='string'||!capture.error.trim())throw new Error('INVALID_TRANSPORT_ERROR');
    out.transportError=capture.error;out.reasons.push(capture.httpStatus===null?'NETWORK_FAILURE':'BODY_READ_FAILURE');return out;
  }
  if(capture.httpStatus!==200) {out.reasons.push(capture.httpStatus===null?'NETWORK_FAILURE':'HTTP_FAILURE');return out;}
  if(capture.rawBody===null||!capture.rawBody.trim()) {out.reasons.push('MISSING_RESPONSE_BODY');return out;}
  let body;try {body=JSON.parse(capture.rawBody);}catch {out.reasons.push('INVALID_JSON');return out;}
  if(!object(body)||body.stat!=='ok') {out.reasons.push('SOURCE_NOT_OK');return out;}
  if(body.date!==`${capture.year}1201`)out.reasons.push('SOURCE_MONTH_MISMATCH');
  const table=Array.isArray(body.tables)?body.tables[0]:null;
  if(!object(table)) {out.reasons.push('MISSING_PRIMARY_TABLE');return out;}
  if(table.title!==TITLE||table.date!==`${capture.year-1911}年12月`
    ||normal(table.subtitle)!==`${issuer.ticker} ${issuer.name} ${capture.year-1911}年12月`)out.reasons.push('TABLE_IDENTITY_MISMATCH');
  if(body.tables.slice(1).some(t=>t?.title===TITLE))out.reasons.push('DUPLICATE_PRIMARY_TABLE');
  const legacy=allowLegacyFiveFields&&Array.isArray(table.fields)&&table.fields.length===5
    &&new Set(table.fields).size===5&&FIELDS.slice(0,5).every(f=>table.fields.includes(f));
  if(!legacy&&(!Array.isArray(table.fields)||table.fields.length!==6||new Set(table.fields).size!==6||!FIELDS.every(f=>table.fields.includes(f))))out.reasons.push('INVALID_FIELDS');
  if(!Array.isArray(table.data)||!Number.isInteger(table.totalCount)||table.totalCount!==table.data?.length)out.reasons.push('INVALID_ROW_COUNT');
  if(!Array.isArray(table.notes)||!table.notes.length||!table.notes.every(n=>typeof n==='string'&&n.trim()))out.reasons.push('MISSING_METHOD_NOTES');
  if(out.reasons.length)return out;
  out.methodNotes=table.notes;out.ignoredAuxiliaryTables=body.tables.length-1;
  if(allowLegacyFiveFields) {
    out.schema=legacy?'legacy-five-fields':'six-fields-with-quarter';
    out.warnings=legacy?['FINANCIAL_PERIOD_NOT_PUBLISHED_IN_LEGACY_SCHEMA']:[];
  }
  if(!table.data.length) {out.reasons.push('NO_DECEMBER_ROWS');return out;}
  const dates=new Set();
  out.rows=table.data.map((raw,index)=>{
    const reasons=[],r=Array.isArray(raw)?raw:[];
    if(r.length!==table.fields.length)reasons.push('INVALID_ROW_WIDTH');
    const get=f=>r[table.fields.indexOf(f)],observationDate=rocDate(get('日期')),financialPeriodEnd=quarter(get('財報年/季'));
    if(!observationDate||!observationDate.startsWith(`${capture.year}-12-`))reasons.push('INVALID_OR_OUT_OF_MONTH_DATE');
    if(observationDate&&dates.has(observationDate))reasons.push('DUPLICATE_OBSERVATION_DATE');if(observationDate)dates.add(observationDate);
    if(!financialPeriodEnd&&!legacy)reasons.push('UNKNOWN_FINANCIAL_PERIOD');
    if(financialPeriodEnd&&observationDate&&financialPeriodEnd>observationDate)reasons.push('FINANCIAL_PERIOD_AFTER_OBSERVATION');
    return {index,observationDate,financialPeriodEnd,rawFinancialPeriod:get('財報年/季')??null,
      pe:parsePublishedMultiple(get('本益比')),pb:parsePublishedMultiple(get('股價淨值比')),raw,reasons};
  });
  out.reasons=[...new Set(out.rows.flatMap(r=>r.reasons))];
  if(!out.reasons.length)out.selected=[...out.rows].sort((a,b)=>b.observationDate.localeCompare(a.observationDate))[0];
  return out;
}
export function studyTpexHistoricalMultiples(captures,{allowLegacyFiveFields=false}={}) {
  if(!Array.isArray(captures))throw new Error('INVALID_CAPTURES');
  if(typeof allowLegacyFiveFields!=='boolean')throw new Error('INVALID_SCHEMA_POLICY');
  const rows=summarizeOwnHistorySources(captures.map(c=>parseTpexHistoryCapture(c,{allowLegacyFiveFields})),TPEX_HISTORY_ISSUERS,'TPEx');
  if(allowLegacyFiveFields)for(const row of rows)row.financialPeriodCoverage={
    selectedObservations:row.years.filter(y=>y.observationDate).length,
    knownPeriods:row.years.filter(y=>y.observationDate&&y.financialPeriodEnd).length,
    unknownPeriodYears:row.years.filter(y=>y.observationDate&&!y.financialPeriodEnd).map(y=>y.year)};
  return {version:allowLegacyFiveFields?'tpex-own-history-reference-multiples-v2-legacy-schema':'tpex-own-history-reference-multiples-v1',
    researchOnly:true,protocolSha256:TPEX_HISTORY_PROTOCOL_SHA,
    ...(allowLegacyFiveFields?{schemaAmendmentSha256:TPEX_HISTORY_AMENDMENT_SHA}:{}),
    methodSource:METHOD_URL,method:'Last December observation before checking each ratio; no fallback day or month.',
    limitations:['TPEx historical table retrieved now; no verified no-back-revision promise or original publication timestamps.',
      'Primary table only. Auxiliary dividend tables are retained in raw captures but excluded from history.',
      'PE denominator is not verified diluted/basic EPS; PB basis is not proven equivalent to MOPS reference BVPS.',
      'No fair value, upside, company-action adjustment or production model is created.',
      ...(allowLegacyFiveFields?['Five-field legacy rows have unknown financial periods; five valid ratios do not certify five comparable denominators.']:[])],
    rows};
}
export async function captureTpexHistory(fetcher=fetch,onProgress=()=>{}) {
  const captures=[];
  for(const {ticker} of TPEX_HISTORY_ISSUERS)for(const year of HISTORY_YEARS) {
    const requestBody=tpexHistoryRequestBody(ticker,year);
    let httpStatus=null,rawBody=null,error=null;
    try {const response=await fetcher(TPEX_HISTORY_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:requestBody,redirect:'error',signal:AbortSignal.timeout(25000)});httpStatus=response.status;rawBody=await response.text();}
    catch(e) {error=e instanceof Error?e.name:'NETWORK_ERROR';}
    captures.push({ticker,year,board:'TPEx',sourceURL:TPEX_HISTORY_URL,httpMethod:'POST',requestBody,
      retrievedAt:new Date().toISOString(),httpStatus,rawBody,rawSha256:rawBody===null?null:sha(rawBody),error});
    onProgress({ticker,year,httpStatus,error});
  }
  return {protocolSha256:TPEX_HISTORY_PROTOCOL_SHA,captures};
}
async function main(args) {
  const amended=args[0]==='--replay-amended';
  if((amended?args.length!==4:args.length!==3)||!['--capture','--replay','--replay-amended'].includes(args[0]))throw new Error('Usage: --capture NEW_CAPTURE_PATH PROTOCOL_PATH | --replay CAPTURE_PATH PROTOCOL_PATH | --replay-amended CAPTURE_PATH PROTOCOL_PATH AMENDMENT_PATH');
  if(sha(await readFile(resolve(args[2])))!==TPEX_HISTORY_PROTOCOL_SHA)throw new Error('PROTOCOL_HASH_MISMATCH');
  if(amended&&sha(await readFile(resolve(args[3])))!==TPEX_HISTORY_AMENDMENT_SHA)throw new Error('AMENDMENT_HASH_MISMATCH');
  let bundle;
  if(args[0]==='--capture') {
    const file=await open(resolve(args[1]),'wx');
    try {bundle=await captureTpexHistory(fetch,info=>process.stderr.write(JSON.stringify(info)+'\n'));
      await file.writeFile(JSON.stringify(bundle,null,2)+'\n');}finally {await file.close();}
  } else bundle=JSON.parse(await readFile(resolve(args[1]),'utf8'));
  if(bundle.protocolSha256!==TPEX_HISTORY_PROTOCOL_SHA)throw new Error('CAPTURE_PROTOCOL_HASH_MISMATCH');
  process.stdout.write(JSON.stringify(studyTpexHistoricalMultiples(bundle.captures,{allowLegacyFiveFields:amended}),null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{
  process.stderr.write((e instanceof Error?e.message:String(e))+'\n');process.exitCode=1;
});
