// CI-only bounded evidence. No response body, URL, header or free-text message
// enters this contract; raw accounting/quote payloads are never modified.
export const SESSION_DIAGNOSTIC_LIMITS=Object.freeze({TW:3,US:2,tailRows:3,maxJsonBytes:12288});
const symbols={TW:['0050.TW','^TWII','2330.TW'],US:['SPY']} as const;
const fields=['open','high','low','close'] as const;
const codes=new Set(['UNCLASSIFIED_ERROR','REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR',
  'REFERENCE_EXPECTED_OHLC_MISSING','REFERENCE_IDENTITY_INVALID','REFERENCE_OHLC_INVALID',
  'REFERENCE_PROVIDER_ERROR','REFERENCE_TIMESTAMPS_INVALID','REFERENCE_FETCH_FAILED',
  'SESSION_REFERENCE_UNAVAILABLE','EXCHANGE_CALENDAR_FETCH_FAILED','NO_RECENT_MARKET_SESSION',
  'NYSE_CALENDAR_INCOMPLETE','NYSE_CALENDAR_UNAVAILABLE','NYSE_CALENDAR_YEAR_UNAVAILABLE','TWSE_CALENDAR_UNAVAILABLE']);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)
  &&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:null;
const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1000000?v:null;
const kinds=new Set(['absent','null','finite-number','nonfinite-number','string','boolean','object','array','other']);
const kind=(v:unknown)=>v===undefined?'absent':v===null?'null':typeof v==='number'?(Number.isFinite(v)?'finite-number':'nonfinite-number'):
  Array.isArray(v)?'array':['string','boolean','object'].includes(typeof v)?typeof v:'other';
const utcDate=(v:unknown)=>finite(v)&&Number.isSafeInteger(v)&&Number.isFinite(new Date(v*1000).getTime())?new Date(v*1000).toISOString().slice(0,10):null;
const observed=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))?v:null;
export function sessionDiagnosticCode(value:unknown) {
  if(typeof value!=='string')return 'UNCLASSIFIED_ERROR';
  const prefix=value.split(' ',1)[0];
  return codes.has(prefix)?prefix:/^UPSTREAM_HTTP_[1-5][0-9]{2}$/.test(prefix)?prefix:'UNCLASSIFIED_ERROR';
}
export function referenceOhlcFacts(quote:any,index:number) {
  const values=Object.fromEntries(fields.map(f=>[f,quote?.[f]?.[index]]));
  const missingFields=fields.filter(f=>!finite(values[f]));
  const nonPositiveFields=fields.filter(f=>finite(values[f])&&values[f]<=0);
  const rangeViolations:string[]=[];
  for(const [a,b,code] of [['high','low','HIGH_BELOW_LOW'],['high','open','HIGH_BELOW_OPEN'],['high','close','HIGH_BELOW_CLOSE'],
    ['open','low','LOW_ABOVE_OPEN'],['close','low','LOW_ABOVE_CLOSE']]) {
    if(finite(values[a])&&finite(values[b])&&values[a]<values[b])rangeViolations.push(code);
  }
  return {ohlcKinds:Object.fromEntries(fields.map(f=>[f,kind(values[f])])),missingFields,nonPositiveFields,rangeViolations};
}
export type SessionTrace={market:'TW'|'US';observedAt:string|null;expectedSessionDate:string|null;references:any[]};
export function sessionTrace(market:'TW'|'US',now:Date):SessionTrace {
  return {market,observedAt:Number.isFinite(now.getTime())?now.toISOString():null,expectedSessionDate:null,references:[]};
}
export function beginReference(trace:SessionTrace,symbol:string,range:'1mo'|'5d'='1mo') {
  const row={symbol,range,rawBarCount:null as number|null,rawLatestDate:null as string|null,parsedLatestDate:null as string|null,
    expectedRawIndex:null as number|null,expectedOhlc:null as any,rawTail:[] as any[],issue:null as string|null};
  trace.references.push(row);return row;
}
export function observeReference(trace:SessionTrace,row:any,payload:any) {
  const r=payload?.chart?.result?.[0],timestamps=r?.timestamp,quote=r?.indicators?.quote?.[0];
  row.rawBarCount=Array.isArray(timestamps)?count(timestamps.length):null;
  row.rawLatestDate=Array.isArray(timestamps)?utcDate(timestamps.at(-1)):null;
  if(!Array.isArray(timestamps))return;
  const i=timestamps.findIndex(t=>utcDate(t)===trace.expectedSessionDate);
  row.expectedRawIndex=i<0?null:i;
  row.expectedOhlc=i<0?null:referenceOhlcFacts(quote,i);
  row.rawTail=timestamps.slice(-SESSION_DIAGNOSTIC_LIMITS.tailRows).map((t,j)=>{
    const index=timestamps.length-Math.min(timestamps.length,SESSION_DIAGNOSTIC_LIMITS.tailRows)+j;
    return {index,timestampKind:kind(t),utcDate:utcDate(t),...referenceOhlcFacts(quote,index)};
  });
}
const rangeCodes=new Set(['HIGH_BELOW_LOW','HIGH_BELOW_OPEN','HIGH_BELOW_CLOSE','LOW_ABOVE_OPEN','LOW_ABOVE_CLOSE']);
function safeFacts(v:any) {
  if(!v||typeof v!=='object')return null;
  return {ohlcKinds:Object.fromEntries(fields.map(f=>[f,kinds.has(v.ohlcKinds?.[f])?v.ohlcKinds[f]:'other'])),
    missingFields:fields.filter(f=>Array.isArray(v.missingFields)&&v.missingFields.includes(f)),
    nonPositiveFields:fields.filter(f=>Array.isArray(v.nonPositiveFields)&&v.nonPositiveFields.includes(f)),
    rangeViolations:[...rangeCodes].filter(c=>Array.isArray(v.rangeViolations)&&v.rangeViolations.includes(c))};
}
export function safeSessionDiagnostics(v:any) {
  if(!v||!['TW','US'].includes(v.market))return null;
  const market=v.market as 'TW'|'US';
  return {market,observedAt:observed(v.observedAt),clockBasis:'caller-preflight-clock',expectedSessionDate:date(v.expectedSessionDate),
    references:(Array.isArray(v.references)?v.references:[]).filter(r=>r&&symbols[market].some(s=>s===r.symbol)).slice(0,SESSION_DIAGNOSTIC_LIMITS[market]).map(r=>({
      symbol:r.symbol,range:r.range==='1mo'||(market==='US'&&r.range==='5d')?r.range:null,
      rawBarCount:count(r.rawBarCount),rawLatestDate:date(r.rawLatestDate),parsedLatestDate:date(r.parsedLatestDate),
      expectedRawIndex:count(r.expectedRawIndex),expectedOhlc:safeFacts(r.expectedOhlc),issue:r.issue===null?null:sessionDiagnosticCode(r.issue),
      rawTail:(Array.isArray(r.rawTail)?r.rawTail:[]).slice(-SESSION_DIAGNOSTIC_LIMITS.tailRows).map(t=>({index:count(t?.index),
        timestampKind:kinds.has(t?.timestampKind)?t.timestampKind:'other',utcDate:date(t?.utcDate),...safeFacts(t)})),
    }))};
}
export function attachSessionDiagnostics(error:unknown,trace:SessionTrace) {
  const e=error instanceof Error?error:new Error('UNCLASSIFIED_ERROR');
  const value=safeSessionDiagnostics(trace);
  if(Object.isExtensible(e))Object.defineProperty(e,'sessionDiagnostics',{value,enumerable:false,configurable:true});
  else {const wrapped=new Error(e.message);Object.defineProperty(wrapped,'sessionDiagnostics',{value,enumerable:false});return wrapped;}
  return e;
}
/** Retry only validated reference rows with empty OHLC on the pinned session.
 * Sanitization is for logging, not authorization: inspect every original row so
 * filtering/truncation cannot hide a permanent failure. An absent date abstains;
 * it never supplies evidence that waiting can repair the expected session. */
export function retryableSessionDate(error:any,market:'TW'|'US',now:Date):string|null {
  const code=sessionDiagnosticCode(error?.message),trace=error?.sessionDiagnostics;
  if(code!=='REFERENCE_EXPECTED_OHLC_MISSING'
    &&!(market==='TW'&&code==='REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR'))return null;
  if(!trace||trace.market!==market||trace.observedAt!==now.toISOString()
    ||!date(trace.expectedSessionDate)||!Array.isArray(trace.references)
    ||!trace.references.length||trace.references.length>SESSION_DIAGNOSTIC_LIMITS[market])return null;
  let hasEmptyExpectedRow=false;
  const seen=new Set<string>();
  for(const row of trace.references) {
    if(!row||!symbols[market].some(symbol=>symbol===row.symbol)
      ||!(row.range==='1mo'||market==='US'&&row.range==='5d')
      ||seen.has(`${row.symbol}:${row.range}`)||row.issue!=='REFERENCE_EXPECTED_OHLC_MISSING'
      ||count(row.rawBarCount)===null||row.rawBarCount===0||!date(row.rawLatestDate)
      ||row.parsedLatestDate!==null&&(!date(row.parsedLatestDate)||row.parsedLatestDate>=trace.expectedSessionDate))return null;
    seen.add(`${row.symbol}:${row.range}`);
    if(row.expectedRawIndex===null) {
      if(row.expectedOhlc!==null)return null;
      continue;
    }
    const facts=row.expectedOhlc;
    if(count(row.expectedRawIndex)===null||row.expectedRawIndex>=row.rawBarCount
      ||row.rawLatestDate<trace.expectedSessionDate||!facts
      ||!Array.isArray(facts.missingFields)||!facts.missingFields.length
      ||!Array.isArray(facts.nonPositiveFields)||facts.nonPositiveFields.length
      ||!Array.isArray(facts.rangeViolations)||facts.rangeViolations.length)return null;
    const empty=fields.filter(field=>['null','absent'].includes(facts.ohlcKinds?.[field]));
    if(!fields.every(field=>['finite-number','null','absent'].includes(facts.ohlcKinds?.[field]))
      ||empty.length!==facts.missingFields.length||!empty.every(field=>facts.missingFields.includes(field)))return null;
    hasEmptyExpectedRow=true;
  }
  return hasEmptyExpectedRow?trace.expectedSessionDate:null;
}
export function safeSessionPreflightFailure(now:Date,outcomes:Array<{market:'TW'|'US';status:'fulfilled'|'rejected';value?:any;reason?:any}>) {
  const markets=outcomes.slice(0,2).filter(o=>o&&['TW','US'].includes(o.market)).map(o=>({market:o.market,status:o.status==='fulfilled'?'verified':'failed',
    verifiedSessionDate:o.status==='fulfilled'?date(o.value?.date):null,
    error:o.status==='rejected'?sessionDiagnosticCode(o.reason?.message):null,
    diagnostics:o.status==='rejected'?safeSessionDiagnostics(o.reason?.sessionDiagnostics):null}));
  const result={event:'session_preflight_failed',observedAt:Number.isFinite(now.getTime())?now.toISOString():null,
    clockBasis:'caller-preflight-clock',markets};
  // Final size guard is fail-safe; retaining per-market codes never emits raw data.
  if(new TextEncoder().encode(JSON.stringify(result)).length>SESSION_DIAGNOSTIC_LIMITS.maxJsonBytes)
    for(const m of markets)if(m.diagnostics)m.diagnostics.references=[];
  return result;
}
