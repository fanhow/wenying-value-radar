// Reproduce comparisons from recorded site inputs, not from invented targets.
import {readFile,writeFile} from 'node:fs/promises';
import {VALUE_REFERENCES,compareReference,summarizeComparisons} from '../lib/value-reference-audit.ts';
const directory=new URL('../outputs/value-audit-20260920/',import.meta.url);
const baseline=JSON.parse(await readFile(new URL('baseline.json',directory),'utf8'));
const replay=JSON.parse(await readFile(new URL('input-replay.json',directory),'utf8'));
const result=VALUE_REFERENCES.map(ref=>{
  const old=baseline.rows.find(r=>r.ticker===ref.ticker&&r.market===ref.market),fresh=replay.find(r=>r.record.ticker===ref.ticker&&r.record.market===ref.market);
  const s=fresh?.record.stock;
  const before=compareReference(ref,old?.stock?{ticker:ref.ticker,market:ref.market,price:old.price,fairValue:old.consensus,quoteDate:old.quoteDate,modelCount:old.model.models.length}:null);
  const after=compareReference(ref,s?{ticker:s.ticker,market:s.market,price:s.price,fairValue:fresh.model.calibratedFairValue,quoteDate:s.updatedAt,modelCount:fresh.model.models.length}:null);
  return {ticker:ref.ticker,market:ref.market,reference:ref.fairValue,before,after,issues:fresh?.record.issues};
});
for(const market of ['TW','US']){
  const rows=result.filter(r=>r.market===market),paired=rows.filter(r=>r.before.aligned&&r.after.aligned);
  console.log(JSON.stringify({market,baseline:summarizeComparisons(rows.map(r=>r.before)),replay:summarizeComparisons(rows.map(r=>r.after)),pairedBefore:summarizeComparisons(paired.map(r=>r.before)),pairedAfter:summarizeComparisons(paired.map(r=>r.after))}));
}
await writeFile(new URL('comparison.json',directory),JSON.stringify(result,null,2));
console.log(result.map(r=>`${r.ticker} | ${r.reference.toFixed(2)} | ${r.before.actual?.fairValue.toFixed(2)??'unavailable'} | ${r.before.gapPct?.toFixed(1)??'n/a'}% | ${r.after.actual?.fairValue.toFixed(2)??'unavailable'} | ${r.after.gapPct?.toFixed(1)??'n/a'}%`).join('\n'));
