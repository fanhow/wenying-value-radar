import type {StockInput} from './valuation.ts';
import {dailyValuationState,DAILY_VALUATION_VERSION} from './daily-valuation-state.ts';

export type DailyClientStatus={state:string;runId?:string|null;valuationVersion?:string|null;taiwanValuationCurrent?:boolean};
export const isUserManagedInput=(stock:StockInput)=>stock.source==='手動輸入'||stock.source==='方舟截圖';
export const isDailyInput=(stock:StockInput)=>!isUserManagedInput(stock)&&stock.priceSource==='Yahoo Finance daily close / daily-refresh-v1';
// Retain original non-daily records on this device, including inactive legacy
// inputs. Persistence is not evidence that an automatic valuation is current.
export const persistableInputs=(inputs:StockInput[])=>inputs.filter(stock=>stock&&typeof stock==='object'&&typeof stock.ticker==='string'&&!isDailyInput(stock));
export function currentClientInput(stock:StockInput,status:DailyClientStatus|null) {
  if(isUserManagedInput(stock))return true;
  // TW automatic inputs must come from the active, versioned generation.
  // A missing source or an arbitrary price-source label is not a manual import.
  // Preserve the existing US non-daily SEC lookup path in this TW-only fix.
  if(!isDailyInput(stock))return stock.market==='US';
  if(!status||!['complete','partial'].includes(status.state))return false;
  if(stock.market!=='TW')return true;
  return status.taiwanValuationCurrent===true&&status.valuationVersion===DAILY_VALUATION_VERSION
    &&!!status.runId&&dailyValuationState(stock,status.runId).rankingEligible;
}
export const withoutDailyInstrument=(inputs:StockInput[],ticker:string,market:string)=>
  inputs.filter(stock=>!(isDailyInput(stock)&&stock.ticker===ticker&&stock.market===market));
export function mergeCurrentInputs(scan:StockInput[],saved:StockInput[],status:DailyClientStatus|null) {
  const key=(s:StockInput)=>`${s.market}:${s.ticker}`;
  const manualKeys=new Set(saved.filter(s=>s.source==='手動輸入').map(key));
  const currentScan=scan.filter(s=>currentClientInput(s,status)&&!manualKeys.has(key(s)));
  const scanKeys=new Set(currentScan.map(key));
  const merged=[...currentScan,...saved.filter(s=>!scanKeys.has(key(s))&&currentClientInput(s,status)
    &&(s.source==='手動輸入'||!manualKeys.has(key(s))))];
  const seen=new Set<string>();
  return merged.filter(s=>{const id=key(s);if(seen.has(id))return false;seen.add(id);return true;});
}
