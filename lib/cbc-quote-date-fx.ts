export const CBC_QUOTE_DATE_FX_SOURCE='https://www.cbc.gov.tw/tw/lp-645-1.html';
export const CBC_FX_MAX_BYTES=1024*1024;
export type CbcQuoteDateFx={quoteDate:string;twdPerUsd:number;unit:'TWD-per-USD';sourceUrl:typeof CBC_QUOTE_DATE_FX_SOURCE;
  provider:'Taipei Forex interbank close published by CBC';publishedAt:null;requestContextAt:string;capturedAt:string;rawSha256:string;
  basis:'same-civil-date-CBC-interbank-close-not-NYSE-close'};
const iso=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
/** Narrow parser for the actual official rwd-table schema. No homepage quote,
 * prior-day fallback, metadata price, locale-number guessing or alternate URL.
 * Missing/malformed/duplicate-date tables are unknown, never a zero FX. */
export function parseCbcQuoteDateFx(html:string,quoteDate:string):number|null {
  if(!iso(quoteDate)||new TextEncoder().encode(html).byteLength>CBC_FX_MAX_BYTES
    ||!html.includes('新臺幣對美元銀行間成交之收盤匯率')||!html.includes('台北外匯經紀股份有限公司'))return null;
  const tables=[...html.matchAll(/<table\b[^>]*class=["'][^"']*\brwd-table\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi)];
  if(tables.length!==1)return null;
  const table=tables[0][1];
  if(!/<th>\s*標題\(日期\)\s*<\/th>/i.test(table)||!/<th>\s*NTD\/USD\s*<\/th>/i.test(table))return null;
  const seen=new Set<string>();let selected:number|null=null;
  for(const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const row=match[1];if(/<th\b/i.test(row))continue;
    const dateCells=[...row.matchAll(/<td\b[^>]*data-th=["']標題\(日期\)["'][^>]*>\s*<span>\s*(\d{4}\/\d{2}\/\d{2})\s*<\/span>\s*<\/td>/gi)];
    const rates=[...row.matchAll(/<td\b[^>]*data-th=["']NTD\/USD["'][^>]*>\s*<span>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/span>\s*<\/td>/gi)];
    if(dateCells.length!==1||rates.length!==1)return null;
    const date=dateCells[0][1].replaceAll('/','-'),value=Number(rates[0][1]);
    if(!iso(date)||seen.has(date)||!Number.isFinite(value)||value<=0)return null;
    seen.add(date);if(date===quoteDate)selected=value;
  }
  return selected;
}
/** One bounded normal-TLS official request per caller. Access/rate-limit
 * failures return unknown without retries, identity changes or another host. */
export async function fetchCbcQuoteDateFx(quoteDate:string,now=new Date(),fetcher:typeof fetch=fetch):Promise<CbcQuoteDateFx|null> {
  if(!iso(quoteDate)||!Number.isFinite(now.getTime())||Date.parse(quoteDate)>now.getTime())return null;
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try{
    const response=await fetcher(CBC_QUOTE_DATE_FX_SOURCE,{headers:{Accept:'text/html'},signal:AbortSignal.timeout(12000),cache:'no-store',redirect:'error'});
    if(!response.ok||!response.body||Number(response.headers.get('content-length')??0)>CBC_FX_MAX_BYTES)return null;
    reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
    for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>CBC_FX_MAX_BYTES){await reader.cancel();return null;}chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const html=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=parseCbcQuoteDateFx(html,quoteDate);
    if(value===null)return null;
    const sha=await crypto.subtle.digest('SHA-256',bytes),rawSha256=Array.from(new Uint8Array(sha),b=>b.toString(16).padStart(2,'0')).join('');
    return {quoteDate,twdPerUsd:value,unit:'TWD-per-USD',sourceUrl:CBC_QUOTE_DATE_FX_SOURCE,
      provider:'Taipei Forex interbank close published by CBC',publishedAt:null,requestContextAt:now.toISOString(),capturedAt:new Date().toISOString(),rawSha256,
      basis:'same-civil-date-CBC-interbank-close-not-NYSE-close'};
  }catch{return null;}finally{reader?.releaseLock();}
}
/** Structural consistency only; a self-reported SHA cannot authenticate a
 * source. The refresh server independently captures the fixed CBC URL before
 * admitting TSM adapter evidence, never a caller's marker on failure. */
export function validCbcQuoteDateFx(value:CbcQuoteDateFx|undefined,quoteDate:string):value is CbcQuoteDateFx {
  return !!value&&iso(quoteDate)&&value.quoteDate===quoteDate&&typeof value.twdPerUsd==='number'&&Number.isFinite(value.twdPerUsd)&&value.twdPerUsd>0
    &&value.unit==='TWD-per-USD'&&value.sourceUrl===CBC_QUOTE_DATE_FX_SOURCE&&value.provider==='Taipei Forex interbank close published by CBC'
    &&value.publishedAt===null&&value.basis==='same-civil-date-CBC-interbank-close-not-NYSE-close'&&/^[a-f0-9]{64}$/.test(value.rawSha256)
    &&typeof value.requestContextAt==='string'&&Number.isFinite(Date.parse(value.requestContextAt))
    &&typeof value.capturedAt==='string'&&Number.isFinite(Date.parse(value.capturedAt))&&Date.parse(value.capturedAt)>=Date.parse(quoteDate);
}
