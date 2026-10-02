import { DAILY_VALUATION_VERSION, dailyValuationState } from './daily-valuation-state.ts';
import type { StockInput } from './valuation.ts';
import {US_EARNINGS_REVIEW_VERSION} from './us-earnings-review.ts';

/** Independent cache format: changing model policy still invalidates every cache. */
export const DAILY_RESEARCH_CACHE_VERSION = 'native-research-2026-10-02-v1';
export const DAILY_RESEARCH_SEAL_VERSION = 'research-cohort-seal-2026-10-02-v1';
export type DailyResearchCache = {
  version:string; valuationVersion:string; usReviewVersion:string; runId:string; quoteDate:string;
  inputDigest:string; hasModel:boolean; rankingEligible:boolean;
  estimatedFairValue:number|null; estimatedUpside:number|null;
  estimatedCalibratedUpside:number|null; nativeFairValue:number|null;
  valuationConfidence:string|null; calibrationConfidence:string|null; issues:string[];
  qualityScore:number|null; risk:string|null; reviewRequired:boolean|null;
};
type State = ReturnType<typeof dailyValuationState>;

// Bind all native and calibration inputs, including peer provenance. The cache
// itself is derived output and must never become evidence for another model.
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
    .filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0)
    .map(([k,v])=>[k,canonical(v)]));
  return value;
}
async function digest(value:unknown) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value))));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
async function inputDigest(input:StockInput) {
  const source={...input};delete source.dailyResearch;
  return digest(source);
}
/** Includes every input and cache field, not just the JSON's self-reported hash. */
export const dailyResearchStockDigest=(input:StockInput)=>digest(input);
export const dailyResearchCohortDigest=(runId:string,market:'TW'|'US',quoteDate:string,members:[string,string][])=>digest({
  version:DAILY_RESEARCH_SEAL_VERSION,cacheVersion:DAILY_RESEARCH_CACHE_VERSION,valuationVersion:DAILY_VALUATION_VERSION,
  usReviewVersion:US_EARNINGS_REVIEW_VERSION,runId,market,quoteDate,members});
function stateValues(state:State) {
  return {hasModel:state.hasModel,rankingEligible:state.rankingEligible,
    estimatedFairValue:state.estimatedFairValue,estimatedUpside:state.estimatedUpside,
    estimatedCalibratedUpside:state.estimatedCalibratedUpside,
    nativeFairValue:state.hasModel?state.stock!.fairValue:null,
    qualityScore:state.stock?.qualityScore??null,risk:state.stock?.risk??null,
    reviewRequired:state.stock?.valuationReviewRequired??null,
    valuationConfidence:state.stock?.valuationConfidence??null,
    calibrationConfidence:state.stock?.calibrationConfidence??null,issues:state.issues};
}
/** Called once per input by the server, before the sealed generation publishes. */
export async function withDailyResearchCache(input:StockInput,runId:string,state=dailyValuationState(input,runId)):Promise<StockInput> {
  return {...input,dailyResearch:{version:DAILY_RESEARCH_CACHE_VERSION,valuationVersion:DAILY_VALUATION_VERSION,
    usReviewVersion:US_EARNINGS_REVIEW_VERSION,runId,quoteDate:input.updatedAt??'',inputDigest:await inputDigest(input),...stateValues(state)}};
}
/** Finalize verifies every server-generated cache, including excluded/formal rows. */
export async function currentDailyResearchCache(input:StockInput,runId:string,quoteDate:string,state=dailyValuationState(input,runId)) {
  const cache=input.dailyResearch;
  if(!cache||cache.version!==DAILY_RESEARCH_CACHE_VERSION||cache.valuationVersion!==DAILY_VALUATION_VERSION
    ||cache.usReviewVersion!==US_EARNINGS_REVIEW_VERSION
    ||cache.runId!==runId||cache.quoteDate!==quoteDate||input.updatedAt!==quoteDate)return false;
  const values=stateValues(state);
  return Object.entries(values).every(([key,value])=>JSON.stringify(cache[key as keyof DailyResearchCache])===JSON.stringify(value))
    && cache.inputDigest===await inputDigest(input);
}
/** A disagreement invalidates the page; it must not create holes in its ranking. */
export async function currentDailyResearch(input:StockInput,runId:string,quoteDate:string) {
  const state=dailyValuationState(input,runId);
  return state.hasModel&&!state.rankingEligible&&Number.isFinite(state.estimatedUpside)
    && currentDailyResearchCache(input,runId,quoteDate,state);
}
