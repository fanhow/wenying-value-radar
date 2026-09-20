import type {RefreshRecord} from './daily-refresh-data.ts';
import {taiwanPerShareIssue} from './daily-refresh-data.ts';
import {buildTaiwanComparableMap} from './taiwan-comparables.ts';
import {withTaiwanBusinessGroup} from './taiwan-business-groups.ts';
import {DAILY_VALUATION_VERSION,dailyValuationState} from './daily-valuation-state.ts';
import {detectValueTrendResonance} from './technical-analysis.ts';

/** Complete cohort first, then same-session peers. Upload chunk order is irrelevant. */
export function prepareTaiwanRefreshGeneration(records:RefreshRecord[],runId:string) {
  if(!/^[a-zA-Z0-9_-]{8,90}$/.test(runId))throw new Error('INVALID_RUN_ID');
  const identities=records.map(r=>`${r.market}:${r.ticker}`);
  if(new Set(identities).size!==identities.length)throw new Error('DUPLICATE_GENERATION_TARGET');
  const prepared=records.map(r=>{
    if(r.market!=='TW'||r.status!=='ready')return r;
    if(!r.stock||r.stock.ticker!==r.ticker||r.stock.market!==r.market)throw new Error('GENERATION_STOCK_IDENTITY');
    const issue=taiwanPerShareIssue(r.stock);
    if(issue)throw new Error(issue);
    return {...r,stock:withTaiwanBusinessGroup({...r.stock,valuationPolicy:'tw-comparables-v1',
      dailyValuationVersion:DAILY_VALUATION_VERSION,dailyRunId:runId,comparableMultiples:undefined})};
  });
  const stocks=prepared.flatMap(r=>r.market==='TW'&&r.status==='ready'&&r.stock?[r.stock]:[]);
  if(new Set(stocks.map(s=>s.updatedAt)).size>1)throw new Error('MIXED_TAIWAN_QUOTE_SESSIONS');
  const peers=buildTaiwanComparableMap(stocks);
  return prepared.map(r=>{
    if(r.market!=='TW'||r.status!=='ready'||!r.stock)return r;
    const stock={...r.stock,comparableMultiples:peers.get(r.ticker)};
    const state=dailyValuationState(stock,runId);
    if(!r.history)throw new Error('GENERATION_HISTORY_REQUIRED');
    return {...r,stock,issues:[...new Set([...r.issues,...state.issues])],history:{...r.history,
      technicalAnalysis:{...r.history.technicalAnalysis,
        valueTrendResonance:detectValueTrendResonance(r.history.candles,state.upside)}}};
  });
}
