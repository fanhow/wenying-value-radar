/**
 * Research comparison contract only. No prices, multiples, FV or share repairs.
 * Validation checks supplied evidence consistency, not source authenticity or
 * complete event discovery. The caller must establish those facts from sources.
 * `matched` certifies neither PIT availability, valuation accuracy nor rankings.
 */
export const TAIWAN_PB_COMPARISON_BASIS_VERSION='tw-pb-comparison-basis-2026-10-03-v1';
export const PB_BASIS_ACTION_KINDS=['split','cash-capital-reduction','stock-dividend','equity-issuance','treasury-share-change'] as const;
export type PbBasisActionKind=typeof PB_BASIS_ACTION_KINDS[number];
export type PbOrdinaryInstrument={ticker:string;exchange:'TWSE'|'TPEx';securityType:'ordinary-share'};
export type PbBasisSource={id:string;url:string;rawSha256:string;retrievedAt:string;publishedAt:string|null};
export type PbBookBasisEvidence={
  instrument:PbOrdinaryInstrument;currency:string;financialPeriodEnd:string;
  equityScope:'parent-ordinary'|'parent-total'|'consolidated'|'unknown';
  denominator:'ordinary-outstanding'|'issued'|'weighted-average'|'unknown';
  bookBasisDate:string|null;shareBasisDate:string|null;quoteBasisDate:string|null;
  bookTreatment:'reported-period-end'|'action-reconciled'|'unknown';
  shareTreatment:'period-end'|'action-reconciled'|'unknown';
  appliedShareActionIds:string[];appliedBookActionIds:string[];sourceIds:string[];
};
export type PbActionEvidence={
  id:string;kind:PbBasisActionKind;effectiveDate:string;equityRecognitionDate:string|null;sourceIds:string[];
  /** Optional explicit identity must agree with the enclosing coverage identity. */
  instrument?:PbOrdinaryInstrument;
};
export type PbActionCoverage={
  instrument:PbOrdinaryInstrument;fromDate:string;toDate:string;
  eventKinds:PbBasisActionKind[];sourceIds:string[];events:PbActionEvidence[];
};
export type PbComparisonBasisInput={
  instrument:PbOrdinaryInstrument;financialPeriodEnd:string;quoteDate:string;
  left:PbBookBasisEvidence|null;right:PbBookBasisEvidence|null;
  sources:PbBasisSource[];actionCoverage:PbActionCoverage|null;
};
export type PbComparisonBasisResult={
  version:typeof TAIWAN_PB_COMPARISON_BASIS_VERSION;
  status:'invalid'|'mismatched'|'unverified'|'matched';comparisonEligible:boolean;reasons:string[];
};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)
  &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const instant=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)
  &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v.replace(/Z$/,v.includes('.')?'Z':'.000Z');
const instrument=(v:unknown):v is PbOrdinaryInstrument=>object(v)&&typeof v.ticker==='string'
  &&/^\d{4,6}$/.test(v.ticker)&&['TWSE','TPEx'].includes(v.exchange as string)&&v.securityType==='ordinary-share';
const identity=(v:PbOrdinaryInstrument)=>`${v.exchange}:${v.ticker}:${v.securityType}`;
const list=(v:unknown):v is string[]=>Array.isArray(v)&&Array.from(v).every(text)&&new Set(v).size===v.length;
function sourceUrl(v:unknown) {
  if(!text(v))return false;
  try {const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password
    &&![...u.searchParams.keys()].some(k=>/token|api.?key|secret|password|authorization|crumb/i.test(k));}catch{return false;}
}
const result=(status:PbComparisonBasisResult['status'],reasons:string[]):PbComparisonBasisResult=>({
  version:TAIWAN_PB_COMPARISON_BASIS_VERSION,status,comparisonEligible:status==='matched',reasons:[...new Set(reasons)],
});
/** Provider as-of, old period-end labels and rounded reference BVPS prove no effective basis. */
export function buildUnverifiedTaiwanPbBasisEvidence(context:Pick<PbComparisonBasisInput,'instrument'|'financialPeriodEnd'|'quoteDate'>):PbBookBasisEvidence {
  return {instrument:{...context.instrument},currency:'unknown',financialPeriodEnd:context.financialPeriodEnd,
    equityScope:'unknown',denominator:'unknown',bookBasisDate:null,shareBasisDate:null,quoteBasisDate:null,
    bookTreatment:'unknown',shareTreatment:'unknown',appliedShareActionIds:[],appliedBookActionIds:[],sourceIds:[]};
}
export function assessTaiwanPbComparisonBasis(input:PbComparisonBasisInput):PbComparisonBasisResult {
  if(!object(input)||!instrument(input.instrument)||!date(input.financialPeriodEnd)||!date(input.quoteDate)
    ||input.financialPeriodEnd>input.quoteDate||!Array.isArray(input.sources))return result('invalid',['INVALID_CONTEXT']);
  const invalid:string[]=[],mismatched:string[]=[],unknown:string[]=[],key=identity(input.instrument);
  const sourceMap=new Map<string,PbBasisSource>();
  for(const s of Array.from(input.sources)) {
    if(!object(s)||!text(s.id)||!sourceUrl(s.url)||typeof s.rawSha256!=='string'||!/^[a-f0-9]{64}$/.test(s.rawSha256)
      ||!instant(s.retrievedAt)||(s.publishedAt!==null&&!instant(s.publishedAt))
      ||(s.publishedAt!==null&&Date.parse(s.publishedAt)>Date.parse(s.retrievedAt))||sourceMap.has(s.id))invalid.push('INVALID_OR_DUPLICATE_SOURCE');
    else sourceMap.set(s.id,s);
  }
  const refs=(ids:unknown)=>list(ids)&&ids.every(id=>sourceMap.has(id));
  const observations=[input.left,input.right];
  for(const e of observations) {
    if(e==null){unknown.push('MISSING_BOOK_BASIS_EVIDENCE');continue;}
    if(!object(e)||!instrument(e.instrument)||identity(e.instrument)!==key||!date(e.financialPeriodEnd)||!text(e.currency)
      ||!['parent-ordinary','parent-total','consolidated','unknown'].includes(e.equityScope)
      ||!['ordinary-outstanding','issued','weighted-average','unknown'].includes(e.denominator)
      ||!['reported-period-end','action-reconciled','unknown'].includes(e.bookTreatment)
      ||!['period-end','action-reconciled','unknown'].includes(e.shareTreatment)
      ||[e.bookBasisDate,e.shareBasisDate,e.quoteBasisDate].some(d=>d!==null&&!date(d))
      ||!list(e.appliedShareActionIds)||!list(e.appliedBookActionIds)||!refs(e.sourceIds)) {
      invalid.push('INVALID_BOOK_BASIS_EVIDENCE');continue;
    }
    if(e.financialPeriodEnd!==input.financialPeriodEnd)mismatched.push('FINANCIAL_PERIOD_MISMATCH');
    if(e.currency!=='unknown'&&e.currency!=='TWD')mismatched.push('CURRENCY_MISMATCH');
    if(e.equityScope!=='unknown'&&e.equityScope!=='parent-ordinary')mismatched.push('EQUITY_SCOPE_MISMATCH');
    if(e.denominator!=='unknown'&&e.denominator!=='ordinary-outstanding')mismatched.push('DENOMINATOR_SCOPE_MISMATCH');
    if(e.quoteBasisDate!==null&&e.quoteBasisDate!==input.quoteDate)mismatched.push('QUOTE_BASIS_MISMATCH');
    if([e.bookBasisDate,e.shareBasisDate].some(d=>d!==null&&(d<input.financialPeriodEnd||d>input.quoteDate)))invalid.push('BASIS_DATE_OUTSIDE_WINDOW');
    if(e.currency==='unknown'||e.equityScope==='unknown'||e.denominator==='unknown')unknown.push('UNKNOWN_BOOK_OR_SHARE_SCOPE');
    if(e.bookBasisDate===null||e.shareBasisDate===null||e.quoteBasisDate===null
      ||e.bookTreatment==='unknown'||e.shareTreatment==='unknown')unknown.push('UNVERIFIED_EFFECTIVE_BASIS');
    if(!e.sourceIds.length)unknown.push('MISSING_BASIS_SOURCES');
  }
  const [left,right]=observations;
  if(left&&right&&!invalid.length) {
    for(const field of ['bookBasisDate','shareBasisDate','bookTreatment','shareTreatment'] as const)
      if(left[field]!==null&&right[field]!==null&&left[field]!=='unknown'&&right[field]!=='unknown'&&left[field]!==right[field])mismatched.push('BOOK_SHARE_BASIS_MISMATCH');
    for(const field of ['appliedShareActionIds','appliedBookActionIds'] as const)
      if(JSON.stringify([...left[field]].sort())!==JSON.stringify([...right[field]].sort()))mismatched.push('ACTION_ADJUSTMENT_CHAIN_MISMATCH');
  }
  const coverage=input.actionCoverage;
  const events=new Map<string,PbActionEvidence>();
  if(coverage==null)unknown.push('MISSING_ACTION_COVERAGE');
  else if(!object(coverage)||!instrument(coverage.instrument)||identity(coverage.instrument)!==key
    ||!date(coverage.fromDate)||!date(coverage.toDate)||coverage.fromDate>coverage.toDate
    ||!list(coverage.eventKinds)||coverage.eventKinds.some(k=>!PB_BASIS_ACTION_KINDS.includes(k as PbBasisActionKind))
    ||!refs(coverage.sourceIds)||!Array.isArray(coverage.events))invalid.push('INVALID_ACTION_COVERAGE');
  else {
    if(coverage.fromDate>input.financialPeriodEnd||coverage.toDate<input.quoteDate
      ||!PB_BASIS_ACTION_KINDS.every(k=>coverage.eventKinds.includes(k))||!coverage.sourceIds.length)unknown.push('INCOMPLETE_ACTION_COVERAGE');
    for(const e of Array.from(coverage.events)) {
      if(!object(e)||!text(e.id)||!PB_BASIS_ACTION_KINDS.includes(e.kind)||!coverage.eventKinds.includes(e.kind)||!date(e.effectiveDate)
        ||e.effectiveDate<coverage.fromDate||e.effectiveDate>coverage.toDate
        ||(e.equityRecognitionDate!==null&&!date(e.equityRecognitionDate))||!refs(e.sourceIds)
        ||(e.instrument!==undefined&&(!instrument(e.instrument)||identity(e.instrument)!==key))||events.has(e.id))invalid.push('INVALID_OR_DUPLICATE_ACTION');
      else {events.set(e.id,e);if(!e.sourceIds.length)unknown.push('MISSING_ACTION_SOURCES');}
    }
  }
  if(!invalid.length)for(const e of observations)if(e) {
    if(coverage!==null&&coverage!==undefined&&[...e.appliedShareActionIds,...e.appliedBookActionIds].some(id=>!events.has(id)))invalid.push('UNKNOWN_ACTION_REFERENCE');
    if(e.bookTreatment==='reported-period-end'&&e.bookBasisDate!==null&&e.bookBasisDate!==input.financialPeriodEnd)mismatched.push('REPORTED_BOOK_DATE_MISMATCH');
    if(e.shareTreatment==='period-end'&&e.shareBasisDate!==null&&e.shareBasisDate!==input.financialPeriodEnd)mismatched.push('PERIOD_END_SHARE_DATE_MISMATCH');
    for(const action of events.values()) {
      const shareApplied=e.appliedShareActionIds.includes(action.id),bookApplied=e.appliedBookActionIds.includes(action.id);
      if((shareApplied||bookApplied)&&action.effectiveDate>input.quoteDate)invalid.push('FUTURE_ACTION_APPLIED');
      if(bookApplied&&action.equityRecognitionDate!==null&&action.equityRecognitionDate>input.quoteDate)invalid.push('FUTURE_EQUITY_RECOGNITION_APPLIED');
      if(shareApplied&&(e.shareTreatment!=='action-reconciled'||e.shareBasisDate===null||e.shareBasisDate<action.effectiveDate))unknown.push('UNVERIFIED_SHARE_ACTION_BASIS');
      if(action.effectiveDate>input.financialPeriodEnd&&action.effectiveDate<=input.quoteDate&&!shareApplied)unknown.push('SHARE_ACTION_RECONCILIATION_REQUIRED');
      const changesEquity=['cash-capital-reduction','equity-issuance','treasury-share-change'].includes(action.kind);
      if(changesEquity&&action.effectiveDate>=input.financialPeriodEnd&&action.effectiveDate<=input.quoteDate
        &&action.equityRecognitionDate===null)unknown.push('UNVERIFIED_EQUITY_RECOGNITION_DATE');
      if(changesEquity&&(action.effectiveDate>input.financialPeriodEnd
        ||(action.equityRecognitionDate!==null&&action.equityRecognitionDate>input.financialPeriodEnd))) {
        if(action.equityRecognitionDate===null||!bookApplied||e.bookTreatment!=='action-reconciled'
          ||e.bookBasisDate===null||e.bookBasisDate<action.equityRecognitionDate)unknown.push(action.kind==='cash-capital-reduction'
            ?'CASH_REDUCTION_BOOK_RECONCILIATION_REQUIRED':'EQUITY_ACTION_BOOK_RECONCILIATION_REQUIRED');
        // A payment date or matching share count cannot establish equity recognition.
        if(action.equityRecognitionDate!==null&&action.equityRecognitionDate>input.quoteDate)unknown.push('EQUITY_RECOGNITION_AFTER_QUOTE');
      }
    }
  }
  if(invalid.length)return result('invalid',invalid);
  if(mismatched.length)return result('mismatched',mismatched);
  if(unknown.length)return result('unverified',unknown);
  return result('matched',[]);
}
