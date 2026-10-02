import {calculateStock, type Stock, type StockInput} from './valuation.ts';
import {getUsEarningsReview} from './us-earnings-review.ts';

// Bump when the production TW engine or business registry changes. Legacy
// generations may retain financials/OHLC, but cannot silently use old targets.
export const DAILY_VALUATION_VERSION = 'tw-comparables-2026-10-02-research-v3';

/** A calculable estimate is research evidence, not automatic ranking eligibility. */
export function valuationRankingState(stock:Stock|null|undefined) {
  const fairValue=stock?.calibratedFairValue??stock?.fairValue;
  const rawUpside=stock?.calibratedUpside??stock?.upside;
  const hasModel=!!stock && stock.models.some(model=>Number.isFinite(model.value)&&model.value>0)
    && Number.isFinite(stock.fairValue) && stock.fairValue>0
    && typeof fairValue==='number' && Number.isFinite(fairValue) && fairValue>0
    && typeof rawUpside==='number' && Number.isFinite(rawUpside);
  const issues:string[]=[];
  if(!hasModel)issues.push('VALUATION_MODEL_UNAVAILABLE');
  else {
    if(stock!.valuationReviewRequired===true)issues.push('VALUATION_REVIEW_REQUIRED');
    if(stock!.valuationConfidence==='low')issues.push('LOW_VALUATION_CONFIDENCE');
    if(stock!.calibrationConfidence==='low')issues.push('LOW_CALIBRATION_CONFIDENCE');
  }
  const rankingEligible=hasModel&&issues.length===0;
  return {hasModel,rankingEligible,estimatedFairValue:hasModel?fairValue!:null,
    estimatedUpside:hasModel?stock!.upside:null,
    estimatedCalibratedUpside:hasModel?rawUpside!:null,
    upside:rankingEligible?rawUpside!:null,issues};
}

// A calibrated display must never conceal weaker native confidence.
export function effectiveValuationConfidence(stock:Pick<Stock,'valuationConfidence'|'calibrationConfidence'>) {
  if(stock.valuationConfidence==='low'||stock.calibrationConfidence==='low')return 'low';
  if(stock.valuationConfidence==='medium'||stock.calibrationConfidence==='medium')return 'medium';
  return stock.valuationConfidence;
}

export function dailyValuationState(input:StockInput|null|undefined, runId?:string) {
  // A source-reviewed earnings basis is not a new fair value. Keep the raw
  // input for audit/OHLC, but do not calculate or expose a misleading value.
  const review=getUsEarningsReview(input);
  if(review)return {...valuationRankingState(null),stock:null,issues:[review.issue],review};
  const current=!!input && (input.market!=='TW' ||
    (input.valuationPolicy==='tw-comparables-v1' && input.dailyValuationVersion===DAILY_VALUATION_VERSION
      && !!input.dailyRunId && (!runId || input.dailyRunId===runId)));
  const stock=current?calculateStock(input!):null;
  const state=valuationRankingState(stock);
  const issues=!input?['VALUATION_INPUT_UNAVAILABLE']:!current?['TW_DAILY_VALUATION_REFRESH_REQUIRED']:state.issues;
  return {...state,stock,issues,review:null};
}
