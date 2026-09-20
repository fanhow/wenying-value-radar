// Read-only source comparison; writes only an ignored local research artifact.
// External facts never enter a valuation calculation or peer selection.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const root=new URL('../',import.meta.url);
const files={baseline:'outputs/taiwan-model-audit/operating-v2/comparison.json',
  candidate:'outputs/taiwan-model-audit/operating-v2/comparison-business-groups.json',
  observations:'docs/taiwan-memory-peer-observations-20260920.json'};
export function compareMemoryPeerAudit(baseline,candidate,references) {
if([baseline,candidate].some(d=>d.inputSha256!==references.inputSha256))throw new Error('FROZEN_INPUT_HASH_MISMATCH');
const expected=['3135','3260','4967','4973','8088','8271','8277'];
if(JSON.stringify(references.rows.map(r=>r.ticker))!==JSON.stringify(expected))throw new Error('PRESPECIFIED_CASE_SET_CHANGED');
const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const modelValue=row=>row?.candidate?.models?.length>0&&valid(row.candidate.fairValue)?row.candidate.fairValue:null;
const index=data=>{
  const out=new Map();
  for(const row of data.rows) {
    if(row?.stock?.market!=='TW'||row.ticker!==row.stock.ticker)throw new Error('INVALID_AUDIT_IDENTITY');
    if(out.has(row.ticker))throw new Error('DUPLICATE_AUDIT_IDENTITY');
    out.set(row.ticker,row);
  }
  return out;
};
const beforeByTicker=index(baseline),afterByTicker=index(candidate);
const rows=references.rows.map(reference=>{
  const before=beforeByTicker.get(reference.ticker),after=afterByTicker.get(reference.ticker);
  const baselineValue=modelValue(before),candidateValue=modelValue(after);
  const issues=[];
  if(!valid(reference.fairValue)||!valid(reference.price))issues.push('INVALID_REFERENCE');
  if(!reference.quoteDate)issues.push('UNVERIFIED_REFERENCE_QUOTE_DATE');
  else if(reference.quoteDate!==after?.stock?.updatedAt||reference.quoteDate!==before?.stock?.updatedAt)issues.push('QUOTE_DATE_MISMATCH');
  const priceMatched=valid(reference.price)&&[before,after].every(r=>valid(r?.stock?.price)&&Math.abs(r.stock.price/reference.price-1)<=.001);
  if(!priceMatched)issues.push('PRICE_MISMATCH');
  if(baselineValue===null||candidateValue===null)issues.push('NO_VALID_MODEL_VALUE');
  const gap=v=>{
    if(v===null||!valid(reference.fairValue))return null;
    const n=(v/reference.fairValue-1)*100;
    if(!Number.isFinite(n)){issues.push('NON_FINITE_GAP');return null;}
    return n;
  };
  const baselineGapPct=gap(baselineValue),candidateGapPct=gap(candidateValue);
  return {...reference,actualPrice:after?.stock?.price??null,actualQuoteDate:after?.stock?.updatedAt??null,
    baselineValue,candidateValue,baselineGapPct,candidateGapPct,priceMatched,aligned:issues.length===0,issues,
    numericalGapImproved:baselineGapPct===null||candidateGapPct===null?null:Math.abs(candidateGapPct)<Math.abs(baselineGapPct),
    reviewRequired:after?.candidate?.reviewRequired??true,reviewReasons:after?.candidate?.reasons??[],
    peerTickers:after?.comparableMultiples?.peerTickers??[],modelIds:after?.candidate?.models?.map(m=>m.id)??[]};
});
const matched=rows.filter(r=>r.aligned);
const stats=key=>{
  const a=matched.map(r=>Math.abs(r[key])).sort((a,b)=>a-b),n=a.length;
  return {count:n,meanAbsoluteGapPct:n?a.reduce((s,v)=>s+v/n,0):null,
    medianAbsoluteGapPct:n?a[Math.floor((n-1)/2)]/2+a[Math.floor(n/2)]/2:null};
};
return {files,inputSha256:references.inputSha256,baselineModelSha256:baseline.modelSha256,candidateModelSha256:candidate.modelSha256,
  referencesSha256:createHash('sha256').update(JSON.stringify(references)).digest('hex'),
  peerClassification:candidate.peerClassification,discoverySet:false,scope:'Prespecified additional same-family cases; not independent cross-sector/time validation',
  coverage:{prespecified:rows.length,withModel:rows.filter(r=>r.candidateValue!==null).length,priceMatched:rows.filter(r=>r.priceMatched).length,aligned:matched.length},
  baseline:stats('baselineGapPct'),candidate:stats('candidateGapPct'),rows};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
const [baseline,candidate,references]=await Promise.all(Object.values(files).map(async file=>JSON.parse(await readFile(new URL(file,root),'utf8'))));
const result=compareMemoryPeerAudit(baseline,candidate,references);
const output=new URL('outputs/taiwan-model-audit/operating-v2/memory-peer-comparison.json',root);
await writeFile(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,rows:result.rows.map(r=>({ticker:r.ticker,baselineGapPct:r.baselineGapPct,candidateGapPct:r.candidateGapPct,aligned:r.aligned,issues:r.issues}))},null,2));
}
