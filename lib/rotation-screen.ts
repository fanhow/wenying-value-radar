import type { StockInput } from './valuation.ts';

export const ROTATION_SCREEN_VERSION='WY-4F-2026.09.20.1';
export type ResearchScope='all'|'technology';
export function inResearchScope(stock:Pick<StockInput,'market'|'sector'|'industry'>,scope:ResearchScope){
  if(scope==='all')return true;
  return stock.market==='TW'?/半導體|電子|電腦|光電|資訊|通信|通訊/.test(stock.industry??''):/^technology$|information technology/i.test(stock.sector);
}
export type ScreenInput={stock:StockInput;close21:number|null;close63:number|null;bars:number;eligible:boolean};
export type ResearchCandidate={ticker:string;name:string;market:'TW'|'US';sector:string;quoteDate:string;price:number;
  earningsYield:number;fcfYield:number;roe:number;debtRatio:number;growth:number;momentum21:number;momentum63:number;
  valueScore:number;qualityScore:number;growthScore:number;momentumScore:number;score:number;rank:number};

// Independent, untrained baseline. No vendor targets, holdings or labels are used.
// Financial firms/REITs require different accounting and are excluded explicitly.
export function screenFeature(input:ScreenInput):Omit<ResearchCandidate,'valueScore'|'qualityScore'|'growthScore'|'momentumScore'|'score'|'rank'>|null {
  const s=input.stock;
  if(!input.eligible||input.bars<64||!s.updatedAt||!['price','eps','fcfPerShare','roe','debtRatio','revenueGrowth'].every(k=>Number.isFinite(s[k as keyof StockInput])))return null;
  if(s.price<=0||s.eps<=0||s.fcfPerShare<=0||s.roe<=0||!input.close21||input.close21<=0||!input.close63||input.close63<=0)return null;
  if(/finance|financial|bank|insurance|reit|real estate|金融|保險|銀行/i.test(`${s.sector} ${s.industry??''}`)||s.market==='TW'&&/^28\d\d$/.test(s.ticker))return null;
  return {ticker:s.ticker,name:s.name,market:s.market,sector:s.sector,quoteDate:s.updatedAt,price:s.price,
    earningsYield:s.eps/s.price,fcfYield:s.fcfPerShare/s.price,roe:s.roe,debtRatio:s.debtRatio,growth:s.revenueGrowth,
    momentum21:s.price/input.close21-1,momentum63:s.price/input.close63-1};
}
type Feature=NonNullable<ReturnType<typeof screenFeature>>;
function percentile(values:number[],value:number) {
  if(values.length<2)return 50;
  let lower=0,equal=0;for(const n of values){if(n<value)lower++;else if(n===value)equal++;}
  return (lower+(equal-1)/2)/(values.length-1)*100;
}
export function rankResearch(features:Feature[],market:'TW'|'US'):ResearchCandidate[] {
  const rows=features.filter(r=>r.market===market);
  if(rows.length<10)return []; // No padded top ten or fabricated candidates.
  const fields=['earningsYield','fcfYield','roe','debtRatio','growth','momentum21','momentum63'] as const;
  const distributions=Object.fromEntries(fields.map(k=>[k,rows.map(r=>r[k])]));
  return rows.map(row=>{
    const p=(key:typeof fields[number])=>percentile(distributions[key],row[key]);
    const valueScore=(p('earningsYield')+p('fcfYield'))/2;
    const qualityScore=(p('roe')+100-p('debtRatio'))/2;
    const growthScore=p('growth'),momentumScore=(p('momentum21')+p('momentum63'))/2;
    return {...row,valueScore,qualityScore,growthScore,momentumScore,score:(valueScore+qualityScore+growthScore+momentumScore)/4,rank:0};
  }).sort((a,b)=>b.score-a.score||a.ticker.localeCompare(b.ticker)).map((row,index)=>({...row,rank:index+1}));
}
