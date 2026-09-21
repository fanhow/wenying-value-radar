// Research only: published reference multiples, not a valuation or EPS adapter.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const HISTORY_PROTOCOL_SHA='87b17e940512a6bede5426985faf887f7edaf4eb072fa567e2ec1d0893066493';
export const HISTORY_YEARS=Object.freeze([2021,2022,2023,2024,2025]);
export const HISTORY_ISSUERS=Object.freeze([
  Object.freeze({ticker:'6176',name:'瑞儀'}),Object.freeze({ticker:'8213',name:'志超'}),
  Object.freeze({ticker:'3592',name:'瑞鼎'}),
]);
const FIELDS=['日期','殖利率(%)','股利年度','本益比','股價淨值比','財報年/季'];
const sha256=v=>createHash('sha256').update(v).digest('hex');
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const positive=v=>finite(v)&&v>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))
  &&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const instant=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(d)
  &&Number.isFinite(Date.parse(d))&&new Date(d).toISOString()===d;
const normalize=s=>typeof s==='string'?s.replace(/\s+/g,' ').trim():'';
function identity(ticker,year) {
  const issuer=HISTORY_ISSUERS.find(i=>i.ticker===ticker);
  if(!issuer||!HISTORY_YEARS.includes(year))throw new Error('OUTSIDE_FIXED_HISTORY_PROTOCOL');
  return issuer;
}
export function historicalRequestUrl(ticker,year) {
  identity(ticker,year);
  return `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=${year}1231&stockNo=${ticker}&response=json`;
}
function rocDate(raw) {
  if(typeof raw!=='string')return null;
  const m=/^(\d{2,3})年(\d{2})月(\d{2})日$/.exec(raw.trim());
  const d=m?`${Number(m[1])+1911}-${m[2]}-${m[3]}`:null;
  return validDate(d)?d:null;
}
function financialPeriod(raw) {
  const m=typeof raw==='string'?/^(\d{2,3})\/([1-4])$/.exec(raw.trim()):null;
  return m?`${Number(m[1])+1911}-${['03-31','06-30','09-30','12-31'][Number(m[2])-1]}`:null;
}
export function parsePublishedMultiple(raw) {
  if(raw===null||raw===undefined||raw==='')return {value:null,reason:'MISSING_MULTIPLE'};
  if(typeof raw==='string'&&raw.trim()==='')return {value:null,reason:'MISSING_MULTIPLE'};
  if(typeof raw==='string'&&['--','-','N/A'].includes(raw.trim()))return {value:null,reason:'SOURCE_MISSING_MARKER'};
  // Never coerce booleans, exponent strings, placeholders, percent values or hex.
  const n=finite(raw)?raw:typeof raw==='string'&&/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw.trim())
    ?Number(raw.trim().replaceAll(',','')):null;
  if(!finite(n))return {value:null,reason:'UNPARSEABLE_OR_NON_FINITE_MULTIPLE'};
  return n>0?{value:n,reason:null}:{value:null,reason:n===0?'ZERO_MULTIPLE':'NEGATIVE_MULTIPLE'};
}

/** Structure/date errors invalidate the whole month; null ratios do not hide rows. */
export function parseHistoricalCapture(capture) {
  if(!object(capture))throw new Error('INVALID_CAPTURE');
  const issuer=identity(capture.ticker,capture.year);
  if(capture.board!=='TWSE'||capture.sourceURL!==historicalRequestUrl(capture.ticker,capture.year))throw new Error('CAPTURE_IDENTITY_MISMATCH');
  if(!instant(capture.retrievedAt))throw new Error('INVALID_CAPTURE_TIME');
  if(capture.year>=Number(capture.retrievedAt.slice(0,4)))throw new Error('YEAR_NOT_COMPLETED_AT_RETRIEVAL');
  if(capture.rawBody!==null&&typeof capture.rawBody!=='string')throw new Error('INVALID_RAW_BODY');
  const hash=capture.rawBody===null?null:sha256(capture.rawBody);
  if(capture.rawSha256!==hash)throw new Error('RAW_HASH_MISMATCH');
  const result={ticker:issuer.ticker,name:issuer.name,board:'TWSE',year:capture.year,sourceURL:capture.sourceURL,
    retrievedAt:capture.retrievedAt,rawSha256:hash,httpStatus:capture.httpStatus,publishedAt:null,
    sourceInstrumentEcho:'company-name-only; ticker is request-bound, not echoed by provider',
    actualCloseVersusSubstitute:'unknown',rows:[],selected:null,reasons:[]};
  if(capture.error!==null&&capture.error!==undefined) {
    if(typeof capture.error!=='string'||!capture.error.trim())throw new Error('INVALID_TRANSPORT_ERROR');
    result.transportError=capture.error;
    result.reasons.push(capture.httpStatus===null?'NETWORK_FAILURE':'BODY_READ_FAILURE');return result;
  }
  if(capture.httpStatus!==200) {result.reasons.push(capture.httpStatus===null?'NETWORK_FAILURE':'HTTP_FAILURE');return result;}
  if(capture.rawBody===null||capture.rawBody.trim()==='') {result.reasons.push('MISSING_RESPONSE_BODY');return result;}
  let data;try {data=JSON.parse(capture.rawBody);}catch {result.reasons.push('INVALID_JSON');return result;}
  if(!object(data)||data.stat!=='OK') {result.reasons.push('SOURCE_NOT_OK');return result;}
  if(data.date!==`${capture.year}1231`)result.reasons.push('SOURCE_DATE_MISMATCH');
  const expectedTitle=`${capture.year-1911}年12月 ${issuer.name} 個股日本益比、殖利率及股價淨值比(以個股月查詢)`;
  if(normalize(data.title)!==expectedTitle)result.reasons.push('SOURCE_TITLE_MISMATCH');
  if(!Array.isArray(data.fields)||data.fields.length!==FIELDS.length||new Set(data.fields).size!==FIELDS.length
    ||!FIELDS.every(f=>data.fields.includes(f)))result.reasons.push('INVALID_FIELDS');
  if(!Array.isArray(data.data)||!Number.isInteger(data.total)||data.total!==data.data?.length)result.reasons.push('INVALID_ROW_COUNT');
  if(result.reasons.length)return result;
  if(!data.data.length) {result.reasons.push('NO_DECEMBER_ROWS');return result;}
  const dates=new Set();
  result.rows=data.data.map((raw,index)=>{
    const reasons=[],r=Array.isArray(raw)?raw:[];
    if(r.length!==FIELDS.length)reasons.push('INVALID_ROW_WIDTH');
    const get=f=>r[data.fields.indexOf(f)];
    const observationDate=rocDate(get('日期')),financialPeriodEnd=financialPeriod(get('財報年/季'));
    if(!observationDate||!observationDate.startsWith(`${capture.year}-12-`))reasons.push('INVALID_OR_OUT_OF_MONTH_DATE');
    if(observationDate&&dates.has(observationDate))reasons.push('DUPLICATE_OBSERVATION_DATE');
    if(observationDate)dates.add(observationDate);
    if(!financialPeriodEnd)reasons.push('UNKNOWN_FINANCIAL_PERIOD');
    if(financialPeriodEnd&&observationDate&&financialPeriodEnd>observationDate)reasons.push('FINANCIAL_PERIOD_AFTER_OBSERVATION');
    return {index,observationDate,financialPeriodEnd,rawFinancialPeriod:get('財報年/季')??null,
      pe:parsePublishedMultiple(get('本益比')),pb:parsePublishedMultiple(get('股價淨值比')),raw,reasons};
  });
  // Malformed dates could be the actual last observation. Do not skip around them.
  for(const row of result.rows)result.reasons.push(...row.reasons);
  result.reasons=[...new Set(result.reasons)];
  if(!result.reasons.length)result.selected=[...result.rows].sort((a,b)=>b.observationDate.localeCompare(a.observationDate))[0];
  return result;
}
function median(values) {
  if(!values.length)return null;
  const a=[...values].sort((x,y)=>x-y),i=Math.floor(a.length/2);
  return a.length%2?a[i]:a[i-1]+(a[i]-a[i-1])/2;
}
export function studyHistoricalMultiples(captures) {
  if(!Array.isArray(captures))throw new Error('INVALID_CAPTURES');
  const sources=captures.map(parseHistoricalCapture),byKey=new Map();
  for(const source of sources) {
    const key=`${source.ticker}|${source.year}`;
    if(byKey.has(key))throw new Error('DUPLICATE_CAPTURE');byKey.set(key,source);
  }
  const rows=HISTORY_ISSUERS.map(issuer=>{
    const years=HISTORY_YEARS.map(year=>{
      const source=byKey.get(`${issuer.ticker}|${year}`),selected=source?.selected;
      return {year,observationDate:selected?.observationDate??null,financialPeriodEnd:selected?.financialPeriodEnd??null,
        rawFinancialPeriod:selected?.rawFinancialPeriod??null,source:source??null,
        pe:selected?.pe??{value:null,reason:source?'INVALID_CAPTURE':'CAPTURE_NOT_PROVIDED'},
        pb:selected?.pb??{value:null,reason:source?'INVALID_CAPTURE':'CAPTURE_NOT_PROVIDED'},
        reasons:source?.reasons??['CAPTURE_NOT_PROVIDED']};
    });
    const summary=metric=>{
      const eligible=years.filter(y=>positive(y[metric].value)),values=eligible.map(y=>y[metric].value);
      return {totalYears:HISTORY_YEARS.length,validPositiveYears:eligible.length,usedYears:eligible.map(y=>y.year),
        positiveYearsDescriptiveMedian:median(values),completeFiveYearMedian:eligible.length===HISTORY_YEARS.length?median(values):null,
        status:eligible.length===HISTORY_YEARS.length?'complete-five-observations':eligible.length?'partial-positive-years':'unavailable'};
    };
    return {...issuer,board:'TWSE',years,pe:summary('pe'),pb:summary('pb')};
  });
  return {version:'twse-own-history-reference-multiples-v1',researchOnly:true,protocolSha256:HISTORY_PROTOCOL_SHA,
    method:'For each fixed issuer/year, select the latest December observation before validating its ratios; no fallback day or month.',
    methodSource:'https://accessibility.twse.com.tw/zh/trading/historical/bwibbu.html',
    limitations:['Published reference multiples, not FY EPS multiples or independently verified ordinary/diluted share bases.',
      'Original publication times, revision history and actual-close versus substitute-price flags are unknown.',
      'Current retrieval does not establish immutable point-in-time availability.',
      'Descriptive own-history ratios only; no fair value, upside, selected multiple or production integration.'],
    rows,unsupported:[{ticker:'1580',name:'新麥',board:'TPEx',reason:'HISTORICAL_SOURCE_NOT_VERIFIED'},
      {ticker:'8183',name:'精星',board:'TPEx',reason:'HISTORICAL_SOURCE_NOT_VERIFIED'}]};
}

export async function captureHistoricalMultiples(fetcher=fetch,onProgress=()=>{}) {
  const captures=[];
  for(const {ticker} of HISTORY_ISSUERS)for(const year of HISTORY_YEARS) {
    const sourceURL=historicalRequestUrl(ticker,year);
    let httpStatus=null,rawBody=null,error=null;
    try {const r=await fetcher(sourceURL,{signal:AbortSignal.timeout(25000),redirect:'error'});httpStatus=r.status;rawBody=await r.text();}
    catch(e) {error=e instanceof Error?e.name:'NETWORK_ERROR';}
    const capture={ticker,year,board:'TWSE',sourceURL,retrievedAt:new Date().toISOString(),httpStatus,rawBody,
      rawSha256:rawBody===null?null:sha256(rawBody),error};
    captures.push(capture);onProgress({ticker,year,httpStatus,error});
  }
  return {protocolSha256:HISTORY_PROTOCOL_SHA,captures};
}

async function main(args) {
  if(args.length!==3||!['--capture','--replay'].includes(args[0]))throw new Error('Usage: --capture NEW_CAPTURE_PATH PROTOCOL_PATH | --replay CAPTURE_PATH PROTOCOL_PATH');
  const protocol=await readFile(resolve(args[2]));if(sha256(protocol)!==HISTORY_PROTOCOL_SHA)throw new Error('PROTOCOL_HASH_MISMATCH');
  let bundle;
  if(args[0]==='--capture') {
    // Reserve the exact path first so an existing artifact is never overwritten.
    // Data are generated output; this is not a source-file editing command.
    const {open}=await import('node:fs/promises');
    const file=await open(resolve(args[1]),'wx');
    try {bundle=await captureHistoricalMultiples(fetch,info=>process.stderr.write(JSON.stringify(info)+'\n'));
      await file.writeFile(JSON.stringify(bundle,null,2)+'\n');}finally {await file.close();}
  } else bundle=JSON.parse(await readFile(resolve(args[1]),'utf8'));
  if(bundle.protocolSha256!==HISTORY_PROTOCOL_SHA)throw new Error('CAPTURE_PROTOCOL_HASH_MISMATCH');
  process.stdout.write(JSON.stringify(studyHistoricalMultiples(bundle.captures),null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{
  process.stderr.write((e instanceof Error?e.message:String(e))+'\n');process.exitCode=1;
});
