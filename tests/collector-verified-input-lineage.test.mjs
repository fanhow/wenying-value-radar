import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {transformSync} from 'esbuild';
import {quarterlyInputs,fetchRefreshRecord} from '../lib/daily-refresh-data.ts';
import {loadUniverse} from '../scripts/daily-refresh.mjs';
import {verifiedHeldHistory} from '../lib/verified-held-refresh-scope.ts';
import {parseYahooDailyCandles} from '../lib/price-history.ts';
import {validTsmcOfficialInput} from '../lib/tsmc-tifrs-official-inputs.ts';
const original=execFileSync('git',['show','3a3f31c4336d3eb10f467154378e4a7991797500:lib/daily-refresh-data.ts'],{encoding:'utf8'});
const code=transformSync(original,{loader:'ts',format:'esm'}).code.replace(/from ["'](\.\/[^"']+)["']/g,(_,path)=>`from ${JSON.stringify(new URL('../lib/'+path.slice(2),import.meta.url).href)}`);
const before=await import('data:text/javascript;base64,'+Buffer.from(code+'\n//# sourceURL=collector-baseline-3a3.mjs').toString('base64'));
const now=new Date('2026-10-14T05:00:00Z'),date='2026-10-13';
const raw=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url)));
const flatten=(node,prefix='')=>{const out={};if(node&&typeof node==='object')for(const [key,value]of Object.entries(node)){const path=prefix?prefix+'.'+key:key;if(typeof value==='number')out[path]=value;else if(value&&typeof value==='object')Object.assign(out,flatten(value,path));}return out;};
test('metadata-only selection retains every prior numeric field and date on actual frozen TW9945 and US EOG',()=>{
 for(const [file,currency]of [['9945-eps-lineage-financial-20261013.json','TWD'],['eog-official-fallback-provider-financial-20261013.json','USD']]){
  const payload=raw(file),old=before.quarterlyInputs(payload,currency,now),next=quarterlyInputs(payload,currency,now),a=flatten(old),b=flatten(next);
  for(const [path,value]of Object.entries(a))assert.ok(Object.is(b[path],value),path);
  assert.equal(next.financialDataDate,old.financialDataDate);assert.equal(next.sourceNote,old.sourceNote);
  assert.equal(next.financialMetrics.epsBasis,'provider-direct-ttm-diluted');assert.equal(next.financialMetrics.epsSourceField,'trailingDilutedEPS');assert.equal(next.financialMetrics.epsAsOfDate,'2026-06-30');
  assert.equal(next.financialMetrics.fcfBasis,'provider-cfo-minus-capital-expenditure');
 }
});
test('missing direct EPS emits proxy lineage from actual quarterly selection, never reverse-infers a basis',()=>{
 const p=raw('eog-official-fallback-provider-financial-20261013.json');p.timeseries.result=p.timeseries.result.filter(row=>row.meta.type[0]!=='trailingDilutedEPS');
 // Synthetic complete EPS quarters isolate selection semantics; the untouched raw control remains separately tested above.
 p.timeseries.result=p.timeseries.result.filter(row=>row.meta.type[0]!=='quarterlyDilutedEPS');
 p.timeseries.result.push({meta:{symbol:['EOG'],type:['quarterlyDilutedEPS']},quarterlyDilutedEPS:['2025-09-30','2025-12-31','2026-03-31','2026-06-30'].map((asOfDate,i)=>({asOfDate,periodType:'3M',currencyCode:'USD',reportedValue:{raw:[2.7,1.3,3.7,5.15][i]}}))});
 const old=before.quarterlyInputs(p,'USD',now),next=quarterlyInputs(p,'USD',now);assert.equal(next.eps,old.eps);assert.equal(next.financialMetrics.epsBasis,'quarter-eps-sum-proxy');assert.equal(next.financialMetrics.epsSourceField,'quarterlyDilutedEPS');
 const missing=structuredClone(p);missing.timeseries.result=missing.timeseries.result.filter(row=>row.meta.type[0]!=='quarterlyDilutedEPS');assert.throws(()=>quarterlyInputs(missing,'USD',now),/EPS_GROWTH_OR_POSITIVE_EQUITY_UNAVAILABLE/);
});
test('scope adds exactly XOM/SPCX/TSM and keeps existing directory targets intact',async()=>{
 const targets=await loadUniverse();assert.equal(targets.length,6270);assert.equal(new Set(targets.map(t=>t.market+':'+t.ticker)).size,6270);
 const snapshot=raw('.././../lib/market-scan-snapshot.json');
 for(const ticker of ['XOM','SPCX','TSM'])assert.ok(targets.find(t=>t.market==='US'&&t.ticker===ticker).securityIdentity.issuerCik);
 assert.equal(targets.filter(t=>t.market==='TW').length,snapshot.taiwanUniverse.length);
});
test('actual Yahoo instrumentType is required; former SPCX ETF prelisting bars are removed without price adjustment',()=>{
 const p=raw('verified-held-spcx-chart-20261013.json'),meta=p.chart.result[0].meta,candles=parseYahooDailyCandles(p,1300);
 assert.equal(meta.quoteType,undefined);assert.equal(meta.instrumentType,'EQUITY');assert.deepEqual(verifiedHeldHistory('SPCX','US',meta,[{...candles[0],date:'2026-06-11'},...candles]),candles);
 assert.throws(()=>verifiedHeldHistory('SPCX','US',{...meta,instrumentType:'ETF'},candles),/QUOTE_SECURITY_IDENTITY_MISMATCH/);
 assert.throws(()=>verifiedHeldHistory('SPCX','US',{...meta,firstTradeDate:undefined},candles),/QUOTE_SECURITY_LISTING_DATE_MISMATCH/);
 const xom=raw('verified-held-xom-chart-20261013.json'),xomCandles=parseYahooDailyCandles(xom,1300);assert.equal(verifiedHeldHistory('XOM','US',xom.chart.result[0].meta,xomCandles),xomCandles);
});
test('the same official adapter runs before TW peer preparation and converts TSM quote units using exact-day CBC data',async()=>{
 const html=readFileSync(new URL('./fixtures/cbc-official-fx-table-20261014.html',import.meta.url));
 for(const ticker of ['2330','TSM']){
  const target={ticker,market:ticker==='2330'?'TW':'US',name:'TSMC',sector:'Technology'};
  const result=await fetchRefreshRecord(target,date,now,async url=>String(url).startsWith('https://www.cbc.gov.tw/')?new Response(html):Response.json(raw(`tsmc-tifrs-${ticker.toLowerCase()}-${String(url).includes('/chart/')?'chart':'financial'}-20261013.json`)));
  assert.equal(result.status,'ready',result.issues.join(','));assert.equal(validTsmcOfficialInput(result.stock),true);assert.equal(result.history.candles.at(-1).date,date);
  assert.equal(result.stock.financialMetrics.sharesOutstanding,25932370000);
  if(ticker==='TSM')assert.equal(result.stock.financialMetrics.ordinarySharesPerSecurity,5);
 }
});
