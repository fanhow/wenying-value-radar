import {calculateStock, type StockInput} from './valuation.ts';
import {getUsEarningsReview} from './us-earnings-review.ts';

// Bump when the production TW engine or business registry changes. Legacy
// generations may retain financials/OHLC, but cannot silently use old targets.
export const DAILY_VALUATION_VERSION = 'tw-comparables-2026-09-21-bridge-v1';

export function dailyValuationState(input:StockInput|null|undefined, runId?:string) {
  // A source-reviewed earnings basis is not a new fair value. Keep the raw
  // input for audit/OHLC, but do not calculate or expose a misleading value.
  const review=getUsEarningsReview(input);
  if(review)return {stock:null,hasModel:false,rankingEligible:false,upside:null,issues:[review.issue],review};
  const current=!!input && (input.market!=='TW' ||
    (input.valuationPolicy==='tw-comparables-v1' && input.dailyValuationVersion===DAILY_VALUATION_VERSION
      && !!input.dailyRunId && (!runId || input.dailyRunId===runId)));
  const stock=current?calculateStock(input!):null;
  const fairValue=stock?.calibratedFairValue??stock?.fairValue;
  const rawUpside=stock?.calibratedUpside??stock?.upside;
  const hasModel=!!stock && stock.models.length>0 && typeof fairValue==='number'
    && Number.isFinite(fairValue) && fairValue>0 && Number.isFinite(rawUpside);
  const rankingEligible=hasModel && stock?.valuationReviewRequired!==true;
  const issues=!input?['VALUATION_INPUT_UNAVAILABLE']:!current?['TW_DAILY_VALUATION_REFRESH_REQUIRED']:
    !hasModel?['VALUATION_MODEL_UNAVAILABLE']:!rankingEligible?['VALUATION_REVIEW_REQUIRED']:[];
  return {stock,hasModel,rankingEligible,upside:rankingEligible?rawUpside!:null,issues,review:null};
}
