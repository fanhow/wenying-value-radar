import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CBC_QUOTE_DATE_FX_SOURCE,CBC_FX_MAX_BYTES,parseCbcQuoteDateFx,fetchCbcQuoteDateFx,validCbcQuoteDateFx} from '../lib/cbc-quote-date-fx.ts';
const bytes=readFileSync(new URL('./fixtures/cbc-official-fx-table-20261014.html',import.meta.url)),html=bytes.toString('utf8'),now=new Date('2026-10-14T05:09:21Z');
test('actual official CBC HTML has exact retained hash and civil-date rate, never a prior-day fallback',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'2703164d4627cfafdbc9b92d9d918ee846f8ed71602f47a7b4b2db829bc36077');
 assert.equal(parseCbcQuoteDateFx(html,'2026-10-13'),32.085);assert.equal(parseCbcQuoteDateFx(html,'2026-10-12'),31.895);
 assert.equal(parseCbcQuoteDateFx(html,'2026-10-14'),null);assert.equal(parseCbcQuoteDateFx(html,'2026-10-11'),null);assert.equal(parseCbcQuoteDateFx(html,'2026-02-30'),null);
});
test('malformed units/source/header, non-positive rates and duplicated/conflicting dates are unknown',()=>{
 const row=html.match(/<tr>\s*<td data-th="標題\(日期\)"><span>2026\/10\/13[\s\S]*?<\/tr>/)[0];
 for(const invalid of [html.replace('台北外匯經紀股份有限公司','unknown'),html.replaceAll('NTD/USD','USD/NTD'),html.replace('標題(日期)</th>','日期</th>'),
  html.replace('<span>32.085</span>','<span>0</span>'),html.replace('<span>32.085</span>','<span>-32.085</span>'),html.replace(row,row+row),html.replace(row,row+row.replace('32.085','33')),
  html+' '.repeat(CBC_FX_MAX_BYTES)])assert.equal(parseCbcQuoteDateFx(invalid,'2026-10-13'),null);
});
test('one bounded fixed official fetch retains raw SHA, USD unit and unknown publication time',async()=>{
 let calls=0;const fx=await fetchCbcQuoteDateFx('2026-10-13',now,async(url,options)=>{calls++;assert.equal(url,CBC_QUOTE_DATE_FX_SOURCE);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(options.signal);return new Response(bytes,{headers:{'Content-Type':'text/html; charset=utf-8'}});});
 assert.equal(calls,1);assert.ok(validCbcQuoteDateFx(fx,'2026-10-13'));assert.equal(fx.publishedAt,null);assert.equal(fx.twdPerUsd,32.085);assert.equal(fx.rawSha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(fx.basis,'same-civil-date-CBC-interbank-close-not-NYSE-close');
 assert.equal(validCbcQuoteDateFx(fx,'2026-10-14'),false);
 assert.equal(await fetchCbcQuoteDateFx('2026-10-14',now,async()=>new Response(bytes)),null);
});
test('access/rate limits and byte overflow return null once without switching reference or identity',async()=>{
 for(const code of [401,403,429,500]){let count=0;assert.equal(await fetchCbcQuoteDateFx('2026-10-13',now,async()=>{count++;return new Response('',{status:code});}),null);assert.equal(count,1);}
 let reads=0,cancelled=false;const response=new Response(new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(CBC_FX_MAX_BYTES+1));},cancel(){cancelled=true;}}));
 assert.equal(await fetchCbcQuoteDateFx('2026-10-13',now,async()=>response),null);assert.ok(cancelled);assert.ok(reads<=2);
 assert.equal(await fetchCbcQuoteDateFx('2026-10-13',now,async()=>{throw Error('timeout');}),null);
});
