// Research only. No production imports, valuation calls, share inference, or input mutation.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const OFFICIAL_BOOK_SOURCES=Object.freeze({
  TWSE:'https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci',
  TPEx:'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap07_O_ci',
});
export const OFFICIAL_BOOK_UNIT_BASIS=Object.freeze({
  sourceURL:'https://mops.twse.com.tw/mops/#/web/t163sb05',
  corroboration:'MOPS UI: 上市／上櫃，一般業，民國 115 年第二季；root observed 2026-09-21',
  monetaryUnit:'TWD thousand',monetaryMultiplier:1000,referenceBvpsUnit:'TWD/share',referenceBvpsDecimalPlaces:2,
  referenceBvpsDenominator:'not verified; not asserted equivalent to ordinary shares outstanding',
  scope:'General-industry ci tables only; financial-industry tables are out of scope',
});
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const positive=v=>finite(v)&&v>0;
const sha256=v=>createHash('sha256').update(v).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'?v.trim():typeof v==='number'&&Number.isFinite(v)?String(v):'';
const issuer=v=>/^\d{4,6}$/.test(text(v))?text(v):null;
const countReasons=rows=>{
  const out={};for(const row of rows)for(const reason of row.reasons)out[reason]=(out[reason]??0)+1;
  return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));
};
function number(v) {
  if(finite(v))return v;
  if(typeof v!=='string')return null;
  const s=v.trim();
  if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return null;
  const n=Number(s.replaceAll(',',''));return finite(n)?n:null;
}
function referenceBvps(v) {
  // Validate the decimal source, not an epsilon around binary floating-point cents.
  // A round-trip check also rejects safe integer cents whose /100 loses a cent.
  const cents=s=>{
    if(!/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s))return null;
    const [whole,fraction='']=s.replaceAll(',','').replace(/^\+/,'').split('.');
    const n=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
    return n>0n&&n<=BigInt(Number.MAX_SAFE_INTEGER)?n:null;
  };
  const original=cents(text(v));if(original===null)return null;
  const value=Number(original)/100;
  return finite(value)&&cents(String(value))===original?value:null;
}
function date(v) {
  return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)
    &&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
}
function instant(v) {
  return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)
    &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v.replace(/Z$/,v.includes('.')?'Z':'.000Z');
}
function rocExportDate(v) {
  const s=text(v);if(!/^\d{7}$/.test(s))return null;
  const d=`${Number(s.slice(0,3))+1911}-${s.slice(3,5)}-${s.slice(5,7)}`;return date(d)?d:null;
}
function period(year,quarter) {
  const y=text(year),q=text(quarter);
  if(!/^\d{1,3}$/.test(y)||Number(y)<1||!/^0?[1-4]$/.test(q))return null;
  return `${Number(y)+1911}-${['03-31','06-30','09-30','12-31'][Number(q)-1]}`;
}
const quarterly=d=>date(d)&&/-(03-31|06-30|09-30|12-31)$/.test(d);
const key=(board,ticker,end)=>`${board}|${ticker}|${end}`;

/** Parse one exact ci endpoint capture; duplicate keys invalidate every copy. */
export function parseOfficialBookCapture(capture) {
  if(!object(capture)||!Object.hasOwn(OFFICIAL_BOOK_SOURCES,capture.board))throw new Error('INVALID_CAPTURE_BOARD');
  if(capture.sourceURL!==OFFICIAL_BOOK_SOURCES[capture.board])throw new Error('CAPTURE_SOURCE_BOARD_MISMATCH');
  if(!instant(capture.retrievedAt))throw new Error('INVALID_CAPTURE_RETRIEVED_AT');
  if(typeof capture.rawBody!=='string')throw new Error('MISSING_CAPTURE_RAW_BODY');
  const rows=JSON.parse(capture.rawBody);
  if(!Array.isArray(rows))throw new Error('INVALID_OFFICIAL_ROWS');
  const parsed=rows.map((raw,index)=>{
    const reasons=[],equityIssues=[],r=object(raw)?raw:{};
    const ticker=issuer(r[capture.board==='TWSE'?'公司代號':'SecuritiesCompanyCode']);
    const name=text(r[capture.board==='TWSE'?'公司名稱':'CompanyName']);
    const financialDate=period(r['年度'],r['季別']);
    const exportDate=rocExportDate(r[capture.board==='TWSE'?'出表日期':'Date']);
    const reportedReferenceBVPS=referenceBvps(r['每股參考淨值']);
    const parentEquityThousandsTwd=number(r['歸屬於母公司業主之權益合計']);
    const parentEquityTwd=parentEquityThousandsTwd===null?null:parentEquityThousandsTwd*1000;
    if(!object(raw))reasons.push('INVALID_OFFICIAL_ROW');
    if(!ticker)reasons.push('INVALID_OFFICIAL_ISSUER');
    if(!name)reasons.push('MISSING_OFFICIAL_NAME');
    if(!financialDate)reasons.push('INVALID_OFFICIAL_PERIOD');
    if(!exportDate)reasons.push('INVALID_EXPORT_DATE');
    if(exportDate&&financialDate&&exportDate<financialDate)reasons.push('EXPORT_BEFORE_PERIOD_END');
    // Export date is a calendar date, not the original filing/publication timestamp.
    // Compare with Taiwan's local capture date, not UTC's possibly previous day.
    const retrievedTaiwanDate=new Date(Date.parse(capture.retrievedAt)+8*3600000).toISOString().slice(0,10);
    if(exportDate&&exportDate>retrievedTaiwanDate)reasons.push('EXPORT_AFTER_RETRIEVAL_DATE');
    if(!positive(reportedReferenceBVPS))reasons.push('INVALID_REFERENCE_BVPS');
    if(reportedReferenceBVPS===null&&positive(number(r['每股參考淨值'])))reasons.push('REFERENCE_BVPS_NOT_2DP_OR_UNSAFE_CENTS');
    if(parentEquityThousandsTwd===null||!finite(parentEquityTwd))equityIssues.push(
      r['歸屬於母公司業主之權益合計']==null||text(r['歸屬於母公司業主之權益合計'])===''?'MISSING_OFFICIAL_PARENT_EQUITY':'INVALID_OFFICIAL_PARENT_EQUITY');
    return {index,board:capture.board,ticker,name,financialDate,rocYear:financialDate?Number(r['年度']):null,
      quarter:financialDate?Number(r['季別']):null,exportDate,publishedDate:null,currency:'TWD',
      reportedReferenceBVPS,parentEquityThousandsTwd,parentEquityTwd:finite(parentEquityTwd)?parentEquityTwd:null,
      sourceURL:capture.sourceURL,retrievedAt:capture.retrievedAt,raw,reasons,equityIssues,
      key:ticker&&financialDate?key(capture.board,ticker,financialDate):null};
  });
  const counts=new Map();for(const row of parsed)if(row.key)counts.set(row.key,(counts.get(row.key)??0)+1);
  for(const row of parsed)if(row.key&&counts.get(row.key)>1)row.reasons.push('DUPLICATE_OFFICIAL_KEY');
  return {board:capture.board,sourceURL:capture.sourceURL,retrievedAt:capture.retrievedAt,
    rawSha256:sha256(capture.rawBody),unitBasis:OFFICIAL_BOOK_UNIT_BASIS,
    counts:{rows:parsed.length,valid:parsed.filter(r=>!r.reasons.length).length,invalid:parsed.filter(r=>r.reasons.length).length,
      referenceAvailable:parsed.filter(r=>!r.reasons.length).length,
      referenceAvailableWithParentEquity:parsed.filter(r=>!r.reasons.length&&!r.equityIssues.length).length},
    countDefinitions:{valid:'Identity/date/positive 2dp reference BVPS valid; parent equity is independently optional'},
    reasonCounts:countReasons(parsed),equityIssueCounts:countReasons(parsed.map(r=>({reasons:r.equityIssues}))),rows:parsed};
}

/** Compare supplied snapshots only. No valuation or inferred share count is produced. */
export function compareTaiwanOfficialBook(input,captures) {
  if(!Array.isArray(input?.records))throw new Error('INVALID_FROZEN_RECORDS');
  if(!Array.isArray(captures)||captures.length!==2||new Set(captures.map(c=>c?.board)).size!==2)throw new Error('REQUIRE_ONE_CAPTURE_PER_BOARD');
  const sources=captures.map(parseOfficialBookCapture).sort((a,b)=>a.board.localeCompare(b.board));
  const official=sources.flatMap(s=>s.rows),byKey=new Map(),used=new Set();
  for(const row of official)if(row.key) {
    const group=byKey.get(row.key)??[];group.push(row);byKey.set(row.key,group);
  }
  const vendorKey=r=>r?.market==='TW'&&issuer(r?.ticker)&&object(r?.stock)&&Object.hasOwn(OFFICIAL_BOOK_SOURCES,r.stock.listingBoard)&&quarterly(r.stock.financialDataDate)
    ?key(r.stock.listingBoard,issuer(r.ticker),r.stock.financialDataDate):null;
  const vendorCounts=new Map();for(const r of input.records) {const k=vendorKey(r);if(k)vendorCounts.set(k,(vendorCounts.get(k)??0)+1);}
  const rows=input.records.map((record,index)=>{
    const s=record?.stock,f=s?.financialMetrics,k=vendorKey(record),ticker=issuer(record?.ticker),reasons=[];
    if(record?.market!=='TW')reasons.push('NOT_TAIWAN');
    if(record?.status!=='ready')reasons.push('NOT_READY');
    if(!object(s)||s.market!=='TW'||!ticker||issuer(s.ticker)!==ticker)reasons.push('INVALID_VENDOR_IDENTITY');
    if(!Object.hasOwn(OFFICIAL_BOOK_SOURCES,s?.listingBoard??''))reasons.push('INVALID_VENDOR_BOARD');
    if(!quarterly(s?.financialDataDate)||record?.financialDate!==s?.financialDataDate)reasons.push('INVALID_OR_CONFLICTING_VENDOR_PERIOD');
    if(f?.currency!=='TWD')reasons.push('VENDOR_CURRENCY_NOT_TWD');
    if(!positive(s?.bvps))reasons.push('INVALID_VENDOR_BVPS');
    if(k&&vendorCounts.get(k)>1)reasons.push('DUPLICATE_VENDOR_KEY');
    const matches=k?byKey.get(k):null,officialRow=matches?.length===1?matches[0]:null;
    if(k&&!matches) {
      const sameIssuer=official.filter(o=>o.ticker===ticker);
      reasons.push(sameIssuer.some(o=>o.board===s.listingBoard)?'NO_SAME_PERIOD_OFFICIAL_ROW':sameIssuer.length?'OFFICIAL_BOARD_MISMATCH':'NO_OFFICIAL_ISSUER');
    } else if(matches&&matches.length!==1)reasons.push('DUPLICATE_OFFICIAL_KEY');
    if(officialRow?.reasons.length)reasons.push(...officialRow.reasons.map(r=>`OFFICIAL_${r}`));
    let comparison=null;
    if(!reasons.length&&officialRow) {
      const reference=officialRow.reportedReferenceBVPS,difference=s.bvps-reference,relativeDifferencePct=(s.bvps/reference-1)*100;
      if(!finite(difference)||!finite(relativeDifferencePct))reasons.push('NON_FINITE_BVPS_COMPARISON');
      else {
        const equity=positive(f?.sharesOutstanding)?s.bvps*f.sharesOutstanding:null;
        const equityValid=positive(equity),officialEquityValid=finite(officialRow.parentEquityTwd);
        const bothEquities=equityValid&&officialEquityValid;
        const equityDifference=bothEquities?equity-officialRow.parentEquityTwd:null;
        const equityPct=bothEquities&&officialRow.parentEquityTwd!==0?(equity/officialRow.parentEquityTwd-1)*100:null;
        comparison={vendorBVPS:s.bvps,reportedReferenceBVPS:reference,bvpsDifference: difference,bvpsRelativeDifferencePct:relativeDifferencePct,
          withinReference2dpRounding:Math.abs(difference)<=.005+Number.EPSILON*Math.max(Math.abs(s.bvps),Math.abs(reference))*4,
          roundingNote:'Tolerance ±0.005 TWD/share only; not proof of identical denominator or accounting basis',
          vendorParentEquityTwd:equityValid?equity:null,vendorParentEquityBasis:equityValid?'derived: vendor BVPS × provider-as-of ordinary shares; not independently captured raw equity':'unavailable',
          officialParentEquityTwd:officialRow.parentEquityTwd,parentEquityDifferenceTwd:finite(equityDifference)?equityDifference:null,
          parentEquityRelativeDifferencePct:finite(equityPct)?equityPct:null,
          equityIssues:[...officialRow.equityIssues,...(!equityValid?['MISSING_OR_NON_FINITE_VENDOR_EQUITY_DERIVATION']:[]),
            ...(officialRow.parentEquityTwd===0?['ZERO_OFFICIAL_PARENT_EQUITY']:[]),
            ...(bothEquities&&(!finite(equityDifference)||(officialRow.parentEquityTwd!==0&&!finite(equityPct)))?['NON_FINITE_EQUITY_COMPARISON']:[])],
          ordinaryBvpsEquivalenceVerified:false};
        used.add(officialRow);
      }
    }
    return {index,ticker,rawVendorTicker:record?.ticker??null,name:s?.name??null,market:record?.market??null,board:s?.listingBoard??null,
      status:comparison?'compared':'unmatched',financialDate:s?.financialDataDate??null,quoteDate:s?.updatedAt??null,
      vendorShareMetadata:{shareBasis:f?.shareBasis??null,shareAsOfDate:f?.shareAsOfDate??null,shareSourceField:f?.shareSourceField??null},
      vendorFetchedAt:record?.fetchedAt??null,vendorSources:record?.sources??[],reasons:[...new Set(reasons)],comparison,
      official:officialRow??null};
  });
  const compared=rows.filter(r=>r.status==='compared'),unmatched=rows.filter(r=>r.status==='unmatched');
  const equityCompared=compared.filter(r=>finite(r.comparison.parentEquityDifferenceTwd)&&finite(r.comparison.parentEquityRelativeDifferencePct)).length;
  const officialUnmatched=official.filter(r=>!used.has(r)).map(r=>({...r,reasons:r.reasons.length?r.reasons:['NO_ELIGIBLE_MATCHING_VENDOR_ROW']}));
  return {auditVersion:'taiwan-official-book-v2',researchOnly:true,unitBasis:OFFICIAL_BOOK_UNIT_BASIS,
    provenance:{observedAt:input.observedAt??null,quoteSession:input.session?.date??null},
    limitations:['Diagnostic comparison, not an ordinary-share BVPS replacement or a valuation.',
      'No inferred shares or changes to vendor financial inputs. Reference BVPS exact denominator remains unverified.',
      'Export date is not publication date; current captures do not establish point-in-time availability at the frozen quote date.',
      'Parent equity is compared with a disclosed vendor BVPS × provider-as-of ordinary shares reconstruction; no independent raw-equity validation.',
      'Vendor share metadata is copied as supplied; missing fields stay null, and neither the legacy period-end-ordinary label nor a provider as-of date independently verifies financial period-end shares.',
      'Missing parent equity stays unavailable independently of reference BVPS; total equity is never substituted and statement scope is not inferred.',
      'General-industry ci endpoints only; source omissions are not proof that an issuer is financial or unavailable elsewhere.'],
    coverage:{records:rows.length,taiwan:input.records.filter(r=>r?.market==='TW').length,ready:input.records.filter(r=>r?.market==='TW'&&r?.status==='ready').length,
      compared:compared.length,referenceCompared:compared.length,unmatched:unmatched.length,officialRows:official.length,officialMatched:used.size,officialUnmatched:officialUnmatched.length,
      equityCompared,referenceComparedWithEquityUnavailable:compared.length-equityCompared},
    coverageDefinitions:{ready:'Taiwan records with status ready',compared:'Alias of referenceCompared: valid same-board/period/TWD reference BVPS comparisons',
      equityCompared:'Reference-compared rows with finite absolute and relative parent-equity differences',
      referenceComparedWithEquityUnavailable:'referenceCompared minus equityCompared; includes missing, zero denominator or non-finite equity arithmetic'},
    unmatchedReasonCounts:countReasons(unmatched),equityIssueCounts:countReasons(compared.map(r=>({reasons:r.comparison.equityIssues}))),
    reasonCountsAreNonExclusive:true,sources:sources.map(({rows:unused,...source})=>{void unused;return source;}),
    rows,officialUnmatched};
}

/** One request per fixed endpoint; no retries, no fallback or credentials. */
export async function fetchOfficialBookCaptures(fetchImpl=globalThis.fetch,timeoutMs=20000) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw new Error('INVALID_TIMEOUT');
  return Promise.all(Object.entries(OFFICIAL_BOOK_SOURCES).map(async([board,sourceURL])=>{
    try {
      const response=await fetchImpl(sourceURL,{signal:AbortSignal.timeout(timeoutMs),headers:{accept:'application/json'}});
      if(!response.ok)throw new Error(`HTTP_${response.status}`);
      const rawBody=await response.text(),capture={board,sourceURL,retrievedAt:new Date().toISOString(),rawBody};
      if(parseOfficialBookCapture(capture).counts.rows===0)throw new Error('EMPTY_OFFICIAL_ROWS');
      return capture;
    } catch(error) {throw new Error(`OFFICIAL_FETCH_FAILED ${board} ${sourceURL}: ${error.message}`);}
  }));
}

export function summarizeOfficialBookAudit(audit) {
  return {auditVersion:audit.auditVersion,researchOnly:audit.researchOnly,unitBasis:audit.unitBasis,
    provenance:audit.provenance,limitations:audit.limitations,coverage:audit.coverage,coverageDefinitions:audit.coverageDefinitions,
    unmatchedReasonCounts:audit.unmatchedReasonCounts,equityIssueCounts:audit.equityIssueCounts,sources:audit.sources,
    rows:audit.rows.map(r=>({ticker:r.ticker,board:r.board,status:r.status,financialDate:r.financialDate,vendorShareMetadata:r.vendorShareMetadata,
      reasons:r.reasons,bvpsRelativeDifferencePct:r.comparison?.bvpsRelativeDifferencePct??null,
      parentEquityRelativeDifferencePct:r.comparison?.parentEquityRelativeDifferencePct??null,equityIssues:r.comparison?.equityIssues??[]}))};
}

async function main() {
  const args=process.argv.slice(2),options={};
  if(args.length===1&&args[0]==='--help') {
    console.log('Research only: node scripts/audit-taiwan-official-book.mjs [--input frozen.json] [--replay capture-or-result.json] [--out new-result.json]\nDefault: frozen operating-v2 input; one request to each official ci endpoint. --replay is offline. --out creates a new file (never overwrites), retaining raw captures.');return;
  }
  for(let i=0;i<args.length;i+=2) {
    if(!['--input','--replay','--out'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(options,args[i]))throw new Error('INVALID_ARGUMENTS');
    options[args[i]]=args[i+1];
  }
  const inputPath=options['--input']?resolve(options['--input']):new URL('../outputs/taiwan-model-audit/operating-v2/inputs.json',import.meta.url);
  const bytes=await readFile(inputPath),input=JSON.parse(bytes.toString('utf8'));
  let captures;
  if(options['--replay']) {
    const replay=JSON.parse(await readFile(resolve(options['--replay']),'utf8'));
    if(replay.captureVersion!=='taiwan-official-book-capture-v1')throw new Error('INVALID_REPLAY_VERSION');
    captures=replay.captures;
  } else captures=await fetchOfficialBookCaptures();
  const result={captureVersion:'taiwan-official-book-capture-v1',captures,
    audit:compareTaiwanOfficialBook(input,captures)};
  if(result.audit.sources.some(source=>source.counts.rows===0))throw new Error('EMPTY_OFFICIAL_ROWS');
  result.audit.provenance.inputSha256=sha256(bytes);
  result.audit.provenance.scriptSha256=sha256(await readFile(new URL(import.meta.url)));
  const json=JSON.stringify(result,null,2);
  if(options['--out'])await writeFile(resolve(options['--out']),json+'\n',{flag:'wx'});
  // stdout omits raw captures; --out retains every row and the complete source bodies.
  console.log(JSON.stringify(summarizeOfficialBookAudit(result.audit),null,2));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1;});
