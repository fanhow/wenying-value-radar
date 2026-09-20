// Read-only production audit. Supply the Sites bearer token as one stdin line.
// Credentials are never persisted; evidence is written only beneath ignored outputs/.
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { calculateStock } from '../lib/valuation.ts';

const base = 'https://stable-value.fanhow.chatgpt.site';
const label=process.argv.find(a=>a.startsWith('--label='))?.slice(8)??'baseline';
if(!/^[a-z0-9-]+$/.test(label))throw new Error('INVALID_OUTPUT_LABEL');
const targets = { TW: ['8069','8299','3036','2451','2610','4938','2344','2345','1102','2382'],
  US: ['LULU','CHTR','PYPL','INTU','FIS','FISV','ACN','ADBE','OWL','NKE'] };
const input = createInterface({input:process.stdin, terminal:false});
let token = '';
console.log('Awaiting private Sites credential on stdin.');
for await (const line of input) { token=line.trim(); input.close(); break; }
if (!token) throw new Error('CREDENTIAL_REQUIRED');
async function query(path,body) {
  try {
    const r=await fetch(base+path,{method:body?'POST':'GET',redirect:'error',headers:{'OAI-Sites-Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
    const payload=r.headers.get('content-type')?.includes('application/json')?await r.json():null;
    return {status:r.status,payload};
  } catch { return {status:null,error:'REQUEST_FAILED',payload:null}; }
}
const output=new URL('../outputs/value-audit-20260920/',import.meta.url);
await mkdir(output,{recursive:true});
const status=await query('/api/daily-status');
const scan=await query('/api/market-scan');
const rows=[];
for (const [market,tickers] of Object.entries(targets)) {
  for(let i=0;i<tickers.length;i+=3) await Promise.all(tickers.slice(i,i+3).map(async ticker=>{
    const valuation=await query('/api/valuation',{market,ticker});
    const history=await query(`/api/price-history?market=${market}&ticker=${ticker}`);
    const stock=valuation.payload?.stock;
    const model=stock?calculateStock(stock):null;
    const rank=(scan.payload?.candidates??[]).filter(s=>s.market===market).findIndex(s=>s.ticker===ticker);
    const row={market,ticker,http:valuation.status,runId:valuation.payload?.freshness?.runId??null,
      issues:valuation.payload?.issues??[],price:stock?.price??null,quoteDate:stock?.updatedAt??null,financialDate:stock?.financialDataDate??null,
      fairValue:model?.fairValue??null,consensus:model?.calibratedFairValue??null,upside:model?.calibratedUpside??null,rank:rank>=0?rank+1:null,stock,model,history};
    rows.push(row);
    console.log(JSON.stringify({...row,stock:undefined,model:undefined,history:undefined}));
  }));
}
token='';
const report={observedAt:new Date().toISOString(),source:base,status,scan,rows};
await writeFile(new URL(`${label}.json`,output),JSON.stringify(report,null,2));
console.log(JSON.stringify({report:new URL(`${label}.json`,output).pathname,status:status.payload,count:rows.length,top10:Object.fromEntries(['TW','US'].map(m=>[m,(scan.payload?.candidates??[]).filter(s=>s.market===m).slice(0,10).map(s=>({ticker:s.ticker,price:s.price}))]))}));
