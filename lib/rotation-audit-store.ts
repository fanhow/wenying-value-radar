import {calculateStock,type StockInput} from './valuation.ts';
import {VALUE_REFERENCES,REFERENCE_REVIEW_DATE,REFERENCE_QUOTE_DATE,compareReference,summarizeComparisons} from './value-reference-audit.ts';
import {ROTATION_SCREEN_VERSION,screenFeature,rankResearch,inResearchScope,type ResearchScope} from './rotation-screen.ts';

export async function rotationAudit(db:D1Database,runId:string,market:'TW'|'US',scope:ResearchScope='all') {
  // Only small, causally selected price fields are returned from each history.
  // No full candle arrays or third-party portfolio payloads go to the browser.
  const found=await db.prepare(`SELECT ticker,stock,issues,status,eligible,upside,
    json_array_length(history,'$.candles') AS bars,
    json_extract(history,'$.candles[#-22].close') AS close21,
    json_extract(history,'$.candles[#-64].close') AS close63
    FROM daily_refresh_records WHERE run_id=? AND market=? ORDER BY ticker`).bind(runId,market).all<{
      ticker:string;stock:string|null;issues:string;status:string;eligible:number;upside:number;bars:number;close21:number|null;close63:number|null}>();
  const rows=(found.results??[]).map(r=>({...r,input:r.status==='ready'&&r.stock?JSON.parse(r.stock) as StockInput:null}));
  const references=VALUE_REFERENCES.filter(r=>r.market===market);
  const compared=references.map(reference=>{
    const r=rows.find(r=>r.ticker===reference.ticker),s=r?.input?calculateStock(r.input):null;
    return {...compareReference(reference,s?{ticker:s.ticker,market:s.market,price:s.price,fairValue:s.calibratedFairValue??s.fairValue,quoteDate:s.updatedAt??'',financialDate:s.financialDataDate,modelCount:s.models.length}:null),issues:r?JSON.parse(r.issues):['OUTSIDE_REFRESH_UNIVERSE']};
  });
  const top10=rows.filter(r=>r.input&&r.eligible&&r.upside>=0.05).sort((a,b)=>b.upside-a.upside||a.ticker.localeCompare(b.ticker)).slice(0,10)
    .map((r,index)=>({ticker:r.ticker,name:r.input!.name,rank:index+1,upsidePct:r.upside*100}));
  const features=rows.flatMap(r=>{
    const feature=r.input&&inResearchScope(r.input,scope)?screenFeature({stock:r.input,bars:r.bars,close21:r.close21,close63:r.close63,eligible:r.eligible===1}):null;
    return feature?[feature]:[];
  });
  const ranked=rankResearch(features,market);
  return {market,runId,referenceReviewedAt:REFERENCE_REVIEW_DATE,referenceQuoteDate:REFERENCE_QUOTE_DATE,
    compared,summary:summarizeComparisons(compared),top10,
    screenshotOverlap:top10.filter(r=>references.some(ref=>ref.ticker===r.ticker)).map(r=>r.ticker),
    screen:{version:ROTATION_SCREEN_VERSION,scope,universe:rows.length,ready:rows.filter(r=>r.input).length,eligible:features.length,
      candidates:ranked.slice(0,10),referenceRanks:references.map(r=>({ticker:r.ticker,rank:ranked.find(x=>x.ticker===r.ticker)?.rank??null}))}};
}
export type RotationAuditResult=Awaited<ReturnType<typeof rotationAudit>>;
