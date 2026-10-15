import {isoDate} from '../lib/daily-refresh-data.ts';
import {safeRawQuoteTail} from '../lib/raw-quote-tail-diagnostics.ts';

const markets=['TW','US'];
const samples=[['TW','1101'],['TW','6488'],['US','AAPL']];
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const errorCodes=new Set([
  'UNCLASSIFIED_ERROR','FAILED','UPSTREAM_UNAVAILABLE','REFRESH_FAILED','MISSING_REFRESH_CREDENTIALS',
  'PROVIDER_RATE_LIMITED','READBACK_VERIFICATION_FAILED','RECORD_PAYLOAD_TOO_LARGE',
  'CORE_FINANCIAL_FIELDS_MISSING','EPS_GROWTH_OR_POSITIVE_EQUITY_UNAVAILABLE',
  'FINANCIAL_PERIOD_STALE_OR_FUTURE','FOUR_QUARTERS_OR_ALIGNED_TTM_UNAVAILABLE',
  'NON_FINITE_DERIVED_FINANCIAL_INPUT','INVALID_TAIWAN_SHARE_METADATA',
  'EPS_SHARE_BASIS_RECONCILIATION_REQUIRED','US_EARNINGS_BASIS_REVIEW_REQUIRED',
  'QUOTE_CURRENCY_UNSUPPORTED','QUOTE_NOT_LATEST_COMPLETED_SESSION','INVALID_CAUSAL_HISTORY',
  'REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR','REFERENCE_EXPECTED_OHLC_MISSING',
  'REFERENCE_IDENTITY_INVALID','REFERENCE_OHLC_INVALID','REFERENCE_PROVIDER_ERROR',
  'REFERENCE_TIMESTAMPS_INVALID','REFERENCE_FETCH_FAILED','SESSION_REFERENCE_UNAVAILABLE',
  'EXCHANGE_CALENDAR_FETCH_FAILED','NO_RECENT_MARKET_SESSION','NYSE_CALENDAR_INCOMPLETE',
  'NYSE_CALENDAR_UNAVAILABLE','NYSE_CALENDAR_YEAR_UNAVAILABLE','TWSE_CALENDAR_UNAVAILABLE',
  'DUPLICATE_GENERATION_TARGET','GENERATION_HISTORY_REQUIRED','GENERATION_STOCK_IDENTITY',
  'INVALID_RUN_ID','MIXED_TAIWAN_QUOTE_SESSIONS','GENERATION_CHANGED_DURING_FINALIZE',
  'GENERATION_NOT_VALIDATING','GENERATION_PEER_EVIDENCE_MISMATCH','NEWER_GENERATION_ALREADY_ACTIVE',
  'INCOMPLETE_BATCHES','INSUFFICIENT_MARKET_COVERAGE','INCONSISTENT_RECORD_DATES',
  'INVALID_BATCH','INVALID_FINANCIAL_INPUT','INVALID_MANIFEST','INVALID_RECORD','INVALID_TARGETS',
  'INVALID_TECHNICAL_ONLY_HISTORY','ELIGIBILITY_REQUIRES_HISTORY','FAILURE_REASON_REQUIRED',
  'FINANCIAL_DATE_MISMATCH','PRICE_HISTORY_MISMATCH','RESEARCH_CACHE_STATE_MISMATCH',
  'RESEARCH_SEAL_CONFLICT','RESEARCH_SEAL_COVERAGE_MISMATCH','RUN_MANIFEST_CONFLICT',
  'TW_DAILY_VALUATION_REFRESH_REQUIRED','UNAVAILABLE_RECORD_HAS_VALUATION_INPUT',
  'UNKNOWN_ACTION','UNKNOWN_RUN','UNKNOWN_TARGET','VALUATION_VERSION_MISMATCH',
  'METHOD_NOT_ALLOWED','UNAUTHORIZED','DATABASE_UNAVAILABLE','PAYLOAD_TOO_LARGE',
]);
const quoteFailureCodes=new Set(['NO_VALID_COMPLETED_CANDLES','INSUFFICIENT_COMPLETED_HISTORY',
  'LATEST_COMPLETED_SESSION_MISMATCH','INVALID_CAUSAL_HISTORY','QUOTE_CURRENCY_UNSUPPORTED','QUOTE_PARSE_FAILED']);
const httpCode=value=>/^(?:UPSTREAM_HTTP_|HTTP_)[1-5][0-9]{2}$/.test(value);
export function diagnosticErrorCode(value) {
  if(typeof value!=='string')return 'UNCLASSIFIED_ERROR';
  const prefix=value.split(' ',1)[0];
  if(errorCodes.has(prefix))return prefix;
  if(httpCode(value))return value;
  const upload=value.match(/^UPLOAD_([1-5][0-9]{2})_(.+)$/);
  if(upload)return `UPLOAD_${upload[1]}_${errorCodes.has(upload[2])||httpCode(upload[2])?upload[2]:'UNCLASSIFIED_ERROR'}`;
  return 'UNCLASSIFIED_ERROR';
}
const date=value=>isoDate(value);
const increment=(counts,key)=>{counts[key]=(counts[key]??0)+1;};

// Allowlisted metadata only. Never echo a provider/HTTP response or an entire record.
export function safeQuoteDiagnostics(value) {
  if(!value||typeof value!=='object')return null;
  const result={expectedSessionDate:date(value.expectedSessionDate),observedQuoteDate:date(value.observedQuoteDate),
    rawLatestTimestamp:typeof value.rawLatestTimestamp==='number'&&Number.isFinite(value.rawLatestTimestamp)?value.rawLatestTimestamp:null,
    rawLatestDate:date(value.rawLatestDate),parsedLatestDate:date(value.parsedLatestDate)};
  for(const key of ['rawBarCount','parsedBarCount','completedBarCount','minimumBars','invalidOhlcRangeCount',
    'expectedSessionRawBars','expectedSessionIncompleteOhlcBars','invalidTimestampCount'])result[key]=count(value[key]);
  result.missingOhlcByField=Object.fromEntries(['open','high','low','close'].map(key=>[key,count(value.missingOhlcByField?.[key])]));
  result.failureReason=value.failureReason==null?null:quoteFailureCodes.has(value.failureReason)?value.failureReason:'UNCLASSIFIED_ERROR';
  result.rawTail=safeRawQuoteTail(value.rawTail);
  return result;
}

export const QUOTE_FAILURE_SAMPLE_LIMITS=Object.freeze({perMarketReason:1,total:12,maxJsonBytes:24576});
// Samples explain individual failures, not population prevalence. No names/positions/URLs.
export function boundedQuoteFailureSamples(records) {
  const candidates=records.flatMap(record=>{
    if(record?.status!=='unavailable'||!markets.includes(record.market)||typeof record.ticker!=='string'
      ||!(record.market==='TW'?/^\d{4}$/:/^[A-Z][A-Z0-9.-]{0,11}$/).test(record.ticker))return [];
    const quote=safeQuoteDiagnostics(record.quoteDiagnostics);
    if(!quote||!quoteFailureCodes.has(quote.failureReason))return [];
    return [{market:record.market,ticker:record.ticker,status:'unavailable',
      issues:[...new Set(record.issues??[])].map(diagnosticErrorCode),quoteDiagnostics:quote}];
  }).sort((a,b)=>{
    // Prioritize the raw-to-parsed tail gap this observation is intended to explain.
    const tailGap=quote=>quote.rawLatestDate===quote.expectedSessionDate&&quote.parsedLatestDate!==quote.expectedSessionDate?0:1;
    const left=`${a.market}:${a.quoteDiagnostics.failureReason}:${tailGap(a.quoteDiagnostics)}:${a.ticker}`;
    const right=`${b.market}:${b.quoteDiagnostics.failureReason}:${tailGap(b.quoteDiagnostics)}:${b.ticker}`;
    return left<right?-1:left>right?1:0;
  });
  const selected=[],groups=new Map();
  for(const candidate of candidates) {
    const group=`${candidate.market}:${candidate.quoteDiagnostics.failureReason}`;
    if((groups.get(group)??0)>=QUOTE_FAILURE_SAMPLE_LIMITS.perMarketReason||selected.length>=QUOTE_FAILURE_SAMPLE_LIMITS.total)continue;
    if(new TextEncoder().encode(JSON.stringify([...selected,candidate])).length>QUOTE_FAILURE_SAMPLE_LIMITS.maxJsonBytes)continue;
    selected.push(candidate);groups.set(group,(groups.get(group)??0)+1);
  }
  return {quoteFailureSamples:selected,quoteFailureSampling:{...QUOTE_FAILURE_SAMPLE_LIMITS,
    eligibleCount:candidates.length,selectedCount:selected.length,omittedCount:candidates.length-selected.length,
    selection:'ASCII-market-reason-raw-to-parsed-gap-first-ticker',representativeness:'not_representative'}};
}

export function safeCoverageDiagnostics(value) {
  if(value?.phase!=='finalize'||!markets.includes(value.failingMarket))return null;
  const coverage={total:count(value.coverage?.total)},requiredReady={},expectedSessions={};
  for(const market of markets) {
    const row=value.coverage?.[market];
    coverage[market]={total:count(row?.total),ready:count(row?.ready),unavailable:count(row?.unavailable)};
    requiredReady[market]=count(value.requiredReady?.[market]);
    expectedSessions[market]=date(value.expectedSessions?.[market]);
    if(Object.values(coverage[market]).some(v=>v===null)||requiredReady[market]===null||!expectedSessions[market])return null;
  }
  if(coverage.total===null)return null;
  return {phase:'finalize',failingMarket:value.failingMarket,coverage,requiredReady,expectedSessions};
}

export function safePublishedResult(value,reasons,runId) {
  const coverage={total:count(value?.coverage?.total)},safeReasons={};
  for(const market of markets)coverage[market]=Object.fromEntries(['total','ready','unavailable']
    .map(key=>[key,count(value?.coverage?.[market]?.[key])]));
  for(const [issue,n] of Object.entries(reasons)) {
    const code=diagnosticErrorCode(issue);
    safeReasons[code]=(safeReasons[code]??0)+(count(n)??0);
  }
  return {runId,
    state:['complete','partial'].includes(value?.state)?value.state:null,coverage,reasons:safeReasons};
}

export function summarizeCollector(records,targets,expectedSessions) {
  const coverage={total:targets.length},issues={},quoteDates={},quoteFailureReasons={};
  for(const market of markets) {
    const rows=records.filter(record=>record.market===market),total=targets.filter(target=>target.market===market).length;
    const ready=rows.filter(row=>row.status==='ready').length,unavailable=rows.filter(row=>row.status==='unavailable').length;
    coverage[market]={total,checked:rows.length,ready,unavailable,missing:total-rows.length};
    issues[market]={};quoteDates[market]={raw:{},parsed:{},completed:{}};quoteFailureReasons[market]={};
    for(const record of rows) {
      for(const issue of new Set(record.issues??[]))increment(issues[market],diagnosticErrorCode(issue));
      const quote=safeQuoteDiagnostics(record.quoteDiagnostics);
      for(const [kind,key] of [['raw','rawLatestDate'],['parsed','parsedLatestDate'],['completed','observedQuoteDate']])
        increment(quoteDates[market][kind],quote?.[key]??'unknown');
      if(quote?.failureReason)increment(quoteFailureReasons[market],quote.failureReason);
    }
  }
  const quoteSamples=samples.map(([market,ticker])=>{
    const record=records.find(row=>row.market===market&&row.ticker===ticker);
    return {market,ticker,expectedSessionDate:date(expectedSessions[market]),status:record?.status??'not_collected',
      issues:[...new Set(record?.issues??[])].map(diagnosticErrorCode),quoteDiagnostics:safeQuoteDiagnostics(record?.quoteDiagnostics)};
  });
  return {coverage,expectedSessions:Object.fromEntries(markets.map(market=>[market,date(expectedSessions[market])])),
    issues,quoteDates,quoteFailureReasons,quoteSamples,...boundedQuoteFailureSamples(records)};
}
