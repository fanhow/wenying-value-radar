import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
export const observedPayloads={SPY:read('SPY-visible-payload.json'),'0050.TW':read('0050-TW-visible-payload.json'),
  '^TWII':read('TWII-visible-payload.json'),'2330.TW':read('2330-TW-visible-payload.json')};
export const observedSpy5d=read('SPY-5d-visible-payload.json');
export const currentObservationClock='2026-10-17T01:26:18.975Z';
export const twCalendar=read('TWSE-2026-visible-calendar.json');
export const nyseCalendar=readFileSync(new URL('NYSE-visible-holiday-table.html',import.meta.url),'utf8');
// These OHLC changes exist only in synthetic test clones, never production input.
export function completeSyntheticSpy() {
  const p=structuredClone(observedPayloads.SPY),r=p.chart.result[0],q=r.indicators.quote[0],i=r.timestamp.length-1;
  r.meta.symbol='SPY';r.meta.currency='USD';
  for(const [k,v] of Object.entries({open:763,high:774,low:760,close:763.25}))q[k][i]=v;
  return p;
}
export function syntheticChart(symbol,currency,dates) {
  return {chart:{result:[{meta:{symbol,currency},timestamp:dates.map(d=>Date.parse(d+'T13:30:00Z')/1000),
    indicators:{quote:[{open:dates.map(()=>100),high:dates.map(()=>102),low:dates.map(()=>99),close:dates.map(()=>101),volume:dates.map(()=>100)}]}}]}};
}
export function sources(payloads=observedPayloads,options={}) {
  const calls=[],writes={begin:0,batch:0,finalize:0,fail:0,unknown:0};
  const fetcher=async(url,init={})=>{
    const u=String(url),method=init.method??'GET';calls.push({url:u,method});
    if(method!=='GET') {
      let action;try {action=JSON.parse(init.body).action;}catch{}
      writes[Object.hasOwn(writes,action)?action:'unknown']++;
      throw new Error('TEST_BLOCKED_ALL_PRODUCTION_WRITES');
    }
    if(u.startsWith('https://www.twse.com.tw/holidaySchedule/holidaySchedule?'))return Response.json(options.twCalendar??twCalendar);
    if(u==='https://www.nyse.com/trade/hours-calendars')return new Response(options.nyseCalendar??nyseCalendar);
    const symbol=decodeURIComponent(u.match(/^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\/([^?]+)\?interval=1d&range=(?:1mo|5d)$/)?.[1]??'');
    if(!Object.hasOwn(payloads,symbol))throw new Error('TEST_BLOCKED_UNKNOWN_REFERENCE');
    const p=u.endsWith('range=5d')&&Object.hasOwn(payloads,'SPY-5d')?payloads['SPY-5d']:payloads[symbol];if(p instanceof Error)throw p;
    return p instanceof Response?p.clone():Response.json(p);
  };
  return {fetcher,calls,writes};
}
