import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fetchRefreshRecord} from '../lib/daily-refresh-data.ts';
import {calculateStock} from '../lib/valuation.ts';
import {loadUniverse} from './daily-refresh.mjs';
const dir=new URL('../outputs/value-audit-20260920/',import.meta.url);
await mkdir(dir,{recursive:true});
const baseline=JSON.parse(await readFile(new URL('baseline.json',dir),'utf8'));
const results=[];
const replay=process.argv.includes('--replay');
const universe=await loadUniverse();
for(let i=0;i<baseline.rows.length;i+=3) await Promise.all(baseline.rows.slice(i,i+3).map(async row=>{
  const target=universe.find(t=>t.ticker===row.ticker&&t.market===row.market);
  if(!target)throw new Error('TARGET_NOT_IN_DIRECTORY');
  const fetcher=async(url,options)=>{
    const file=new URL(`${row.ticker}-${String(url).includes('timeseries')?'financials':'chart'}.json`,dir);
    if(replay)return new Response(await readFile(file,'utf8'),{headers:{'Content-Type':'application/json'}});
    const r=await fetch(url,options);
    if(r.ok)await writeFile(file,await r.clone().text());
    return r;
  };
  const record=await fetchRefreshRecord(target,baseline.status.payload.expectedSessions[row.market],new Date(baseline.observedAt),fetcher);
  const model=record.stock?calculateStock(record.stock):null;
  results.push({record,model});
  console.log(JSON.stringify({ticker:row.ticker,status:record.status,issues:record.issues,fair:model?.calibratedFairValue,models:model?.models?.length,ebitda:record.stock?.ebitdaPerShare}));
}));
await writeFile(new URL(replay?'input-replay.json':'input-recheck.json',dir),JSON.stringify(results,null,2));
