// User-supplied 20-stock comparison, checked in the authenticated source UI.
// These observations NEVER enter the valuation engine or production ranking.
export const REFERENCE_REVIEW_DATE = '2026-09-20';
export const REFERENCE_QUOTE_DATE = '2026-09-18';
export type ValueReference = {ticker:string;market:'TW'|'US';name:string;order:number;price:number;fairValue:number;upsidePct:number;source:string};
const source=(symbol:string)=>`https://hk.investing.com/pro/${symbol}`;
export const VALUE_REFERENCES:ValueReference[] = [
  ['8069','元太',146.5,218.89,49.4,'TPEX:8069'],
  ['8299','群聯',2140,3024.67,41.3,'TPEX:8299'],
  ['3036','文曄',205.5,288.90,40.6,'TWSE:3036'],
  ['2451','創見',283,394.47,39.4,'TWSE:2451'],
  ['2610','華航',20.15,27.16,34.8,'TWSE:2610'],
  ['4938','和碩',90.30,120.74,33.7,'TWSE:4938'],
  ['2344','華邦電',179.50,235.54,31.2,'TWSE:2344'],
  ['2345','智邦',1855,2404.01,29.6,'TWSE:2345'],
  ['1102','亞泥',35.15,45.16,28.5,'TWSE:1102'],
  ['2382','廣達',343,437.52,27.6,'TWSE:2382'],
].map(([ticker,name,price,fairValue,upsidePct,symbol],index)=>({ticker:String(ticker),market:'TW' as const,name:String(name),order:index+1,price:Number(price),fairValue:Number(fairValue),upsidePct:Number(upsidePct),source:source(String(symbol))}));
VALUE_REFERENCES.push(...[
  ['LULU','Lululemon',98.06,171.61,75.0,'NASDAQGS:LULU'],
  ['CHTR','Charter',128.17,221.57,72.9,'NASDAQGS:CHTR'],
  ['PYPL','PayPal',52.41,88.98,69.8,'NASDAQGS:PYPL'],
  ['INTU','Intuit',303.19,513.35,69.3,'NASDAQGS:INTU'],
  ['FIS','Fidelity National Information',35.62,59.68,67.6,'NYSE:FIS'],
  ['FISV','Fiserv',47.19,78.22,65.8,'NASDAQGS:FISV'],
  ['ACN','Accenture',181.29,297.17,63.9,'NYSE:ACN'],
  ['ADBE','Adobe',248.92,406.85,63.4,'NASDAQGS:ADBE'],
  ['OWL','Blue Owl Capital',9.84,15.96,62.2,'NYSE:OWL'],
  ['NKE','Nike',35.51,55.57,56.5,'NYSE:NKE'],
].map(([ticker,name,price,fairValue,upsidePct,symbol],index)=>({ticker:String(ticker),market:'US' as const,name:String(name),order:index+1,price:Number(price),fairValue:Number(fairValue),upsidePct:Number(upsidePct),source:source(String(symbol))})));

export type AuditValue = {ticker:string;market:'TW'|'US';price:number;fairValue:number;quoteDate:string;modelCount:number;financialDate?:string};
export function compareReference(reference:ValueReference,actual:AuditValue|null) {
  const valid=actual&&actual.ticker===reference.ticker&&actual.market===reference.market&&[actual.price,actual.fairValue].every(n=>Number.isFinite(n)&&n>0);
  const aligned=!!valid&&actual.quoteDate===REFERENCE_QUOTE_DATE&&Math.abs(actual.price/reference.price-1)<=0.001;
  return {...reference,actual:valid?actual:null,aligned,
    gapPct:valid?(actual.fairValue/reference.fairValue-1)*100:null,
    upsideGapPp:aligned?((actual.fairValue/actual.price-1)*100-reference.upsidePct):null};
}
export function summarizeComparisons(rows:ReturnType<typeof compareReference>[]) {
  const matched=rows.filter(r=>r.aligned&&r.gapPct!==null);
  const gaps=matched.map(r=>Math.abs(r.gapPct!)).sort((a,b)=>a-b);
  const middle=Math.floor(gaps.length/2);
  return {total:rows.length,available:rows.filter(r=>r.actual).length,matched:matched.length,
    meanAbsoluteGapPct:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null,
    medianAbsoluteGapPct:gaps.length?(gaps.length%2?gaps[middle]:(gaps[middle-1]+gaps[middle])/2):null};
}
