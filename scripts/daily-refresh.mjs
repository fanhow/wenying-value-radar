import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fetchRefreshRecord,expectedSession} from '../lib/daily-refresh-data.ts';
import {prepareTaiwanRefreshGeneration} from '../lib/daily-refresh-generation.ts';
import {DAILY_VALUATION_VERSION} from '../lib/daily-valuation-state.ts';

const base='https://stable-value.fanhow.chatgpt.site';
const token=process.env.WENYING_SITE_TOKEN, key=process.env.WENYING_REFRESH_SECRET;
const runId=`daily_${randomUUID()}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(body) {
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const r=await fetch(base+'/api/data-refresh',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${token}`,'X-WenYing-Refresh-Key':key},body:JSON.stringify({runId,...body}),signal:AbortSignal.timeout(45000)});
      const result=await r.json().catch(()=>({error:`HTTP_${r.status}`}));
      if(!r.ok)throw new Error(`UPLOAD_${r.status}_${result.error??'FAILED'}`);
      return result;
    }catch(e){if(attempt===2)throw e;await sleep((attempt+1)*3000);}
  }
}
export async function loadUniverse() {
  const snapshot=JSON.parse(await readFile(new URL('../lib/market-scan-snapshot.json',import.meta.url),'utf8'));
  const us=JSON.parse(await readFile(new URL('../lib/us-market-snapshot.json',import.meta.url),'utf8'));
  const rows=[...snapshot.taiwanUniverse.map(s=>({...s,market:'TW'})),...us.map(s=>({...s,market:'US'}))];
  const targets=[...new Map(rows.filter(s=>s.market==='TW'?/^\d{4}$/.test(s.ticker):/^[A-Z][A-Z0-9.-]{0,11}$/.test(s.ticker)).map(s=>[`${s.market}:${s.ticker}`,{ticker:s.ticker,name:s.name,market:s.market,sector:s.sector??(s.market==='TW'?'台灣上市公司':'Other'),industry:s.industry,listingBoard:s.listingBoard}])).values()];
  return targets;
}
async function main() {
  if(!token||!key)throw new Error('MISSING_REFRESH_CREDENTIALS');
  const now=new Date(),[tw,us]=await Promise.all([expectedSession('TW',now),expectedSession('US',now)]);
  console.log(JSON.stringify({event:'sessions_verified',TW:tw,US:us}));
  const targets=await loadUniverse();
  const manifest={valuationVersion:DAILY_VALUATION_VERSION,targets:targets.map(({ticker,market})=>({ticker,market})),expectedSessions:{TW:tw.date,US:us.date},
    universeSource:['Existing WenYing Taiwan equity directory and US equity directory; new listings require directory maintenance',tw.source,us.source,tw.calendarSource,us.calendarSource]};
  let began=false;
  try {
    await api({action:'begin',manifest});began=true;
    let done=0,ready=0;const reasons={},collected=[];
    // A fixed, small pool and pause avoid an unbounded burst to the public data provider.
    for(let offset=0;offset<targets.length;offset+=8) {
      const records=await Promise.all(targets.slice(offset,offset+8).map(t=>fetchRefreshRecord(t,manifest.expectedSessions[t.market],new Date())));
      collected.push(...records);
      done+=records.length;ready+=records.filter(r=>r.status==='ready').length;
      for(const r of records)for(const issue of r.issues)reasons[issue]=(reasons[issue]??0)+1;
      if(done%200===0||done===targets.length)console.log(JSON.stringify({event:'progress',checked:done,total:targets.length,ready,unavailable:done-ready}));
      // Abort clearly on sustained rate limiting instead of publishing mostly failed data.
      if((reasons.UPSTREAM_HTTP_429??0)>100)throw new Error('PROVIDER_RATE_LIMITED');
      await sleep(150);
    }
    const generation=prepareTaiwanRefreshGeneration(collected,runId);
    for(const records of refreshUploadBatches(generation,runId))await api({action:'batch',records});
    const result=await api({action:'finalize'});
    console.log(JSON.stringify({event:'published',...result,reasons}));
    const check=await fetch(base+'/api/daily-status',{headers:{'OAI-Sites-Authorization':`Bearer ${token}`},cache:'no-store'});
    const status=await check.json();if(!check.ok||status.runId!==runId||!['complete','partial'].includes(status.state))throw new Error('READBACK_VERIFICATION_FAILED');
    console.log('Private website readback verified. No stock-level payloads or credentials are written to CI logs.');
  } catch(e) {if(began)await api({action:'fail',error:e.message}).catch(()=>{});throw e;}
}
export function refreshUploadBatches(records,runId) {
  const batches=[];let batch=[];
  const bytes=items=>Buffer.byteLength(JSON.stringify({runId,action:'batch',records:items}),'utf8');
  for(const record of records) {
    if(bytes([record])>1400000)throw new Error('RECORD_PAYLOAD_TOO_LARGE');
    if(batch.length===8||bytes([...batch,record])>1400000){batches.push(batch);batch=[];}
    batch.push(record);
  }
  if(batch.length)batches.push(batch);
  return batches;
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
