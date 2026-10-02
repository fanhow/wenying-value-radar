import type {Stock} from '../lib/valuation.ts';
import {valuationRankingState} from '../lib/daily-valuation-state.ts';
import {effectiveValuationUpside} from '../lib/valuation-calibration.ts';
import type {DailyClientStatus} from '../lib/daily-client-state.ts';

export type ValuationListScope='official'|'research';
export type ValuationListFilter='all'|'undervalued'|'overvalued'|'quality'|'risk';
export type ValuationListSort='recommended'|'upside'|'quality'|'price';
export type ValuationListMarket='all'|'TW'|'US';

/** Filtered requests own their generation even when a slower scan fails. */
export function researchScanMayReplace(activeRequestKey:string,scanRunId:string|null|undefined) {
  if(!activeRequestKey)return true;
  if(!scanRunId)return false;
  try {return (JSON.parse(activeRequestKey) as {runId?:string}).runId!==scanRunId;}
  catch {return true;}
}

export function researchFailureScope(options:{market:'TW'|'US';requestRunId:string;currentRunId?:string|null;
  responseStatus?:number;freshness?:{runId?:string|null;state?:string}}):ValuationListMarket {
  const {freshness}=options;
  return options.responseStatus===409||options.currentRunId!==options.requestRunId
    ||!!freshness?.runId&&freshness.runId!==options.requestRunId
    ||!!freshness?.state&&!['complete','partial'].includes(freshness.state)?'all':options.market;
}

export function researchRowsAfterInvalidation<T extends {market:'TW'|'US'}>(rows:T[],scope:ValuationListMarket) {
  return scope==='all'?[]:rows.filter(row=>row.market!==scope);
}

export function researchValuesAfterInvalidation<T>(values:Record<'TW'|'US',T>,scope:ValuationListMarket,empty:T) {
  return scope==='all'?{TW:empty,US:empty}:{...values,[scope]:empty};
}

export function researchHeadAfterFailure(current:DailyClientStatus|null,requestRunId:string,
  freshness:Partial<DailyClientStatus>|undefined,generationRejected=false):DailyClientStatus|null {
  if(current?.runId!==requestRunId)return current;
  if(freshness?.state&&(freshness.runId&&freshness.runId!==requestRunId||!['complete','partial'].includes(freshness.state)))
    return {...freshness,state:freshness.state};
  return generationRejected?{state:'unavailable',runId:null,valuationVersion:null,taiwanValuationCurrent:false}:current;
}

export function researchRequestQuery(options:{market:ValuationListMarket;filter:ValuationListFilter;
  sort:ValuationListSort;query:string;runId:string},offset=0,marketOverride?:'TW'|'US') {
  const market=marketOverride??options.market;
  const sort=options.sort==='recommended'||options.sort==='upside'
    ?options.filter==='overvalued'?'upside_asc':'upside':options.sort;
  const params=new URLSearchParams({scope:'research',filter:options.filter,sort,query:options.query.trim(),
    runId:options.runId,offset:String(offset),limit:'20'});
  if(market!=='all')params.set('market',market);
  return params.toString();
}

export function selectValuationList(stocks:Stock[],options:{scope:ValuationListScope;market:ValuationListMarket;
  filter:ValuationListFilter;sort:ValuationListSort;query:string}) {
  const query=options.query.trim().toLowerCase();
  const gap=(stock:Stock)=>options.scope==='research'?stock.upside:effectiveValuationUpside(stock);
  const filtered=stocks.filter(stock=>{
    const state=valuationRankingState(stock);
    if(!state.hasModel||(options.scope==='official'?!state.rankingEligible:state.rankingEligible))return false;
    if(options.market!=='all'&&stock.market!==options.market)return false;
    if(query&&![stock.ticker,stock.name,stock.sector,stock.industry??''].some(value=>value.toLowerCase().includes(query)))return false;
    return options.filter==='all'
      ||options.filter==='undervalued'&&gap(stock)>=.1
      ||options.filter==='overvalued'&&gap(stock)<=-.1
      ||options.filter==='quality'&&stock.qualityAvailable!==false&&stock.qualityScore>=75
      ||options.filter==='risk'&&(stock.risk==='高'||stock.valuationReviewRequired===true);
  });
  if(options.sort==='recommended')return filtered;
  return [...filtered].sort((a,b)=>{
    if(a.market!==b.market)return a.market==='TW'?-1:1;
    const difference=options.sort==='quality'?b.qualityScore-a.qualityScore:options.sort==='price'?b.price-a.price:
      options.filter==='overvalued'?gap(a)-gap(b):gap(b)-gap(a);
    return difference||a.ticker.localeCompare(b.ticker);
  });
}
