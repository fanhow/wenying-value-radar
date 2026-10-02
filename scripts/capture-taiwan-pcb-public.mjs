// Public, unauthenticated research capture/replay. No cloud writes or credential use.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {fetchRefreshRecord} from '../lib/daily-refresh-data.ts';
import {buildTaiwanIndustryMap} from '../lib/taiwan-industry.ts';
import {buildTaiwanComparableMap} from '../lib/taiwan-comparables.ts';
import {calculateStock} from '../lib/valuation.ts';
import {valuationRankingState} from '../lib/daily-valuation-state.ts';
import {TAIWAN_BUSINESS_GROUPS,TAIWAN_BUSINESS_REGISTRY_VERSION,withTaiwanBusinessGroup} from '../lib/taiwan-business-groups.ts';
import {parseOfficialBookCapture} from './audit-taiwan-official-book.mjs';

export const PCB_PUBLIC_CANDIDATES=Object.freeze([
  ['8213','志超'],['5469','瀚宇博'],['3044','健鼎'],['2355','敬鵬'],['2367','燿華'],['2368','金像電'],
  ['2313','華通'],['2316','楠梓電'],['6191','精成科'],['4927','泰鼎-KY'],
].map(([ticker,name])=>Object.freeze({ticker,name,market:'TW',listingBoard:'TWSE',sector:'台灣上市公司'})));
const MEMORY_PUBLIC_CANDIDATES=TAIWAN_BUSINESS_GROUPS[0].members.map(({ticker,name})=>({ticker,name,market:'TW'}));
const QUOTE_DATE='2026-10-01';
const BASIC_URL='https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
const BOOK_URL='https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci';
const CLOSE_URL='https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20261001&stockNo=8213&response=json';
const TPEX_BASIC_URL='https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O';
const TPEX_QUOTES_URL='https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes';
const TPEX_BOOK_URL='https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap07_O_ci';
const BUSINESS_URLS=['https://www.compeq.com.tw/product01.php','https://www.wus.com.tw/index.php/zh-tw/?lang=zh',
  'https://www.gbm.com.tw/','https://www.apex-intl.com.tw/about/group-history'];
const ALLOWED_HOSTS=new Set(['query1.finance.yahoo.com','query2.finance.yahoo.com','openapi.twse.com.tw','www.twse.com.tw',
  'www.compeq.com.tw','www.wus.com.tw','www.gbm.com.tw','www.apex-intl.com.tw','www.tpex.org.tw']);
const sha=v=>createHash('sha256').update(v).digest('hex');
const modelFiles=['lib/taiwan-comparables.ts','lib/taiwan-multiple-applicability.ts','lib/valuation.ts','lib/daily-valuation-state.ts','lib/daily-refresh-data.ts'];

function resolvedTargets(candidates,twseBasic,tpexBasic=[],tpexQuotes=[]) {
  const twse=buildTaiwanIndustryMap(twseBasic,'TWSE'),tpex=buildTaiwanIndustryMap(tpexBasic,'TPEx');
  return candidates.map(target=>{
    const listed=twseBasic.some(r=>String(r['公司代號'])===target.ticker);
    const otc=tpexQuotes.some(r=>String(r.SecuritiesCompanyCode)===target.ticker);
    assert.notEqual(listed,otc,'Exactly one official board identity is required for '+target.ticker);
    const listingBoard=listed?'TWSE':'TPEx';
    if(target.listingBoard)assert.equal(target.listingBoard,listingBoard);
    return {...target,listingBoard,sector:listed?'台灣上市公司':'台灣上櫃公司',industry:(listed?twse:tpex).get(target.ticker)};
  });
}
async function capture(directory,cohort) {
  await mkdir(directory);await mkdir(join(directory,'raw'));
  const observedAt=new Date().toISOString(),captures=[];
  const captureFetcher=async(url,init={})=>{
    assert.ok(ALLOWED_HOSTS.has(new URL(String(url)).hostname),'Only fixed unauthenticated public hosts are allowed');
    const retrievedAt=new Date().toISOString(),item={requestedUrl:String(url),retrievedAt,httpMethod:'GET',httpStatus:null,rawPath:null,rawSha256:null};
    captures.push(item);
    try {
      const response=await fetch(url,{...init,headers:{Accept:'application/json,text/html','User-Agent':'Mozilla/5.0 (WenYingLocalReadOnlyAudit)'},
        signal:AbortSignal.timeout(20000),cache:'no-store'});
      const bytes=Buffer.from(await response.arrayBuffer()),file=sha(String(url))+'.body';
      item.finalUrl=response.url;item.httpStatus=response.status;item.contentType=response.headers.get('content-type');
      item.rawPath='raw/'+file;item.rawSha256=sha(bytes);item.byteLength=bytes.length;
      await writeFile(join(directory,item.rawPath),bytes,{flag:'wx'});
      return new Response(bytes,{status:response.status,headers:{'Content-Type':item.contentType??'application/octet-stream'}});
    } catch(error) {item.error=error.message;throw error;}
  };
  const candidates=cohort==='memory'?MEMORY_PUBLIC_CANDIDATES:PCB_PUBLIC_CANDIDATES;
  const officialUrls=cohort==='memory'?[BASIC_URL,BOOK_URL,TPEX_BASIC_URL,TPEX_QUOTES_URL,TPEX_BOOK_URL]:[BASIC_URL,BOOK_URL,CLOSE_URL];
  const officialResults=await Promise.allSettled(officialUrls.map(url=>captureFetcher(url)));
  const basic=officialResults[0].status==='fulfilled'&&officialResults[0].value.ok?await officialResults[0].value.json():[];
  const optionalJson=async i=>officialResults[i]?.status==='fulfilled'&&officialResults[i].value.ok?await officialResults[i].value.json():[];
  const tpexBasic=cohort==='memory'?await optionalJson(2):[],tpexQuotes=cohort==='memory'?await optionalJson(3):[];
  const targets=resolvedTargets(candidates,Array.isArray(basic)?basic:[],Array.isArray(tpexBasic)?tpexBasic:[],Array.isArray(tpexQuotes)?tpexQuotes:[]);
  const records=[];
  for(let i=0;i<targets.length;i+=2) {
    const part=await Promise.all(targets.slice(i,i+2).map(target=>fetchRefreshRecord(target,QUOTE_DATE,new Date(observedAt),captureFetcher)));
    records.push(...part);
    process.stdout.write(JSON.stringify({captured:records.length,total:targets.length,ready:records.filter(r=>r.status==='ready').length})+'\n');
  }
  if(cohort==='pcb')await Promise.allSettled(BUSINESS_URLS.map(url=>captureFetcher(url)));
  const input={version:'pcb-public-bounded-capture-v1',cohort,observedAt,session:{date:QUOTE_DATE,basis:'Explicit fixed comparison date; not a complete current-session universe.'},
    boundedCandidates:candidates,records,...(cohort==='memory'?{businessRegistryVersion:TAIWAN_BUSINESS_REGISTRY_VERSION}:{}),
    limitations:[cohort==='memory'?'All seven existing memory registry members, fixed before capture; not a complete market universe.':'Bounded PCB business-evidence candidates, not a complete or approved comparable universe.',
      'Business scopes differ; no end-market or segment profitability equality is asserted.',
      'Current public retrieval is not point-in-time publication evidence.']};
  await writeFile(join(directory,'inputs.json'),JSON.stringify(input,null,2)+'\n',{flag:'wx'});
  await writeFile(join(directory,'captures.json'),JSON.stringify({observedAt,captures},null,2)+'\n',{flag:'wx'});
  return input;
}

export async function evaluatePublicCapture(directory,input) {
  const rawInput=await readFile(join(directory,'inputs.json')),rawCaptures=await readFile(join(directory,'captures.json'));
  const manifest=JSON.parse(rawCaptures),raw=[];
  assert.equal(input.observedAt,manifest.observedAt,'Capture observation time must match the raw source manifest');
  for(const item of manifest.captures) {
    if(!item.rawPath)continue;
    const bytes=await readFile(join(directory,item.rawPath));assert.equal(sha(bytes),item.rawSha256);
    raw.push({...item,rawBody:bytes.toString('utf8')});
  }
  const body=url=>raw.find(r=>r.requestedUrl===url&&r.httpStatus===200);
  const basic=body(BASIC_URL)?JSON.parse(body(BASIC_URL).rawBody):[];
  const cohort=input.cohort??'pcb',candidates=cohort==='memory'?MEMORY_PUBLIC_CANDIDATES:PCB_PUBLIC_CANDIDATES;
  assert.ok(['pcb','memory'].includes(cohort));
  if(cohort==='memory')assert.equal(input.businessRegistryVersion,TAIWAN_BUSINESS_REGISTRY_VERSION);
  assert.deepEqual(input.boundedCandidates,candidates,'Fixed candidate list must not change during replay');
  assert.equal(input.session.date,QUOTE_DATE);
  const tpexBasic=body(TPEX_BASIC_URL)?JSON.parse(body(TPEX_BASIC_URL).rawBody):[],tpexQuotes=body(TPEX_QUOTES_URL)?JSON.parse(body(TPEX_QUOTES_URL).rawBody):[];
  const targets=resolvedTargets(candidates,Array.isArray(basic)?basic:[],Array.isArray(tpexBasic)?tpexBasic:[],Array.isArray(tpexQuotes)?tpexQuotes:[]);
  const frozenFetcher=async url=>{
    const capture=raw.find(r=>r.requestedUrl===String(url));
    assert.ok(capture,'Frozen source URL is unavailable; no network fallback');
    return new Response(capture.rawBody,{status:capture.httpStatus,headers:{'Content-Type':capture.contentType??'application/json'}});
  };
  const regenerated=[];
  for(const target of targets)regenerated.push(await fetchRefreshRecord(target,QUOTE_DATE,new Date(input.observedAt),frozenFetcher));
  // JSON persistence omits JavaScript undefined keys. Compare the persisted
  // contract exactly; never add metadata or coerce finite financial values.
  const persisted=JSON.parse(rawInput.toString('utf8')).records;
  assert.deepEqual(JSON.parse(JSON.stringify(input.records)),persisted,'Evaluation input differs from the persisted capture');
  assert.deepEqual(JSON.parse(JSON.stringify(regenerated)),persisted,'Frozen raw bodies must reproduce every original collector record without metadata repair');
  let officialBook=[],bookIssue=null;
  try {for(const [board,url] of [['TWSE',BOOK_URL],['TPEx',TPEX_BOOK_URL]]) {const c=body(url);if(c)officialBook.push(...parseOfficialBookCapture({board,sourceURL:url,retrievedAt:c.retrievedAt,rawBody:c.rawBody}).rows);}}
  catch(error){bookIssue=error.message;}
  const stocks=input.records.filter(r=>r.status==='ready').map(r=>cohort==='memory'?withTaiwanBusinessGroup(r.stock):r.stock),peers=buildTaiwanComparableMap(stocks);
  const rows=input.records.map(record=>{
    if(record.status!=='ready')return {ticker:record.ticker,status:record.status,issues:record.issues};
    const stock=cohort==='memory'?withTaiwanBusinessGroup(record.stock):record.stock,p=peers.get(stock.ticker),calculated=calculateStock({...stock,comparableMultiples:p,valuationPolicy:'tw-comparables-v1'}),state=valuationRankingState(calculated);
    const official=officialBook.find(r=>r.ticker===stock.ticker&&r.board===stock.listingBoard&&r.financialDate===stock.financialDataDate);
    const currentBasic=stock.listingBoard==='TWSE'?(Array.isArray(basic)?basic.find(r=>String(r['公司代號'])===stock.ticker):null)
      :(Array.isArray(tpexBasic)?tpexBasic.find(r=>String(r.SecuritiesCompanyCode)===stock.ticker):null);
    const m=stock.financialMetrics;
    return {ticker:stock.ticker,name:stock.name,listingBoard:stock.listingBoard,industry:stock.industry,taiwanBusinessGroup:stock.taiwanBusinessGroup,status:record.status,quoteDate:record.quoteDate,financialDate:record.financialDate,
      price:stock.price,eps:stock.eps,bvps:stock.bvps,sps:stock.revenuePerShare,roe:stock.roe,roeBasis:m?.roeBasis,
      netMargin:stock.netMargin,operatingMargin:stock.ebitPerShare/stock.revenuePerShare*100,
      providerShares:{value:m?.sharesOutstanding,basis:m?.shareBasis,asOfDate:m?.shareAsOfDate,sourceField:m?.shareSourceField},
      currentOfficialBasic:currentBasic?Object.fromEntries(Object.entries(currentBasic).filter(([key])=>/公司代號|公司名稱|出表日期|普通股|特別股|面額|股本|產業別/.test(key))):null,
      officialQuarter:official?{financialDate:official.financialDate,exportDate:official.exportDate,referenceBvps:official.reportedReferenceBVPS,
        parentEquityTwd:official.parentEquityTwd,raw:official.raw,reasons:official.reasons,equityIssues:official.equityIssues}:null,
      reconciliation:official?{samePeriod:true,referenceBvpsDifferencePct:(stock.bvps/official.reportedReferenceBVPS-1)*100,
        vendorParentEquity:m.sharesOutstanding*stock.bvps,officialParentEquity:official.parentEquityTwd,
        interpretation:'Diagnostic only: do not infer exact shares from rounded reference BVPS or mix current issued shares with quarterly book.'}:null,
      modelIds:calculated.models.map(model=>model.id),modelValues:calculated.models.map(model=>({id:model.id,value:model.value})),
      estimatedFairValue:state.estimatedFairValue,confidence:calculated.valuationConfidence,rankingEligible:state.rankingEligible,
      rankingIssues:state.issues,comparableMultiples:p??null,excludedModels:calculated.excludedModels,
      sourceUrls:record.sources};
  });
  let officialTargetClose=null;
  if(body(CLOSE_URL)) {
    const b=JSON.parse(body(CLOSE_URL).rawBody),index=b.fields?.indexOf('收盤價'),dated=b.data?.filter(r=>r[0]==='115/10/01');
    if(b.stat==='OK'&&index>=0&&dated?.length===1)officialTargetClose={date:QUOTE_DATE,price:Number(dated[0][index].replaceAll(',','')),rawRow:dated[0],sourceUrl:CLOSE_URL,sourceSha256:body(CLOSE_URL).rawSha256};
  }
  const modelHashes=Object.fromEntries(await Promise.all(modelFiles.map(async file=>[file,sha(await readFile(new URL('../'+file,import.meta.url)))])));
  return {version:'pcb-public-bounded-evaluation-v1',cohort,observedAt:input.observedAt,quoteDate:QUOTE_DATE,inputSha256:sha(rawInput),captureManifestSha256:sha(rawCaptures),modelHashes,
    sourceReplay:{status:'PASS',regeneratedRecords:regenerated.length,rawBodiesHashVerified:raw.length,networkFallback:false},
    summary:{candidates:input.records.length,ready:stocks.length,calculable:rows.filter(r=>r.estimatedFairValue>0).length,rankingEligible:rows.filter(r=>r.rankingEligible).length},
    officialTargetClose,officialBookIssue:bookIssue,rows,
    sourceSummary:manifest.captures,
    limitations:[...input.limitations,cohort==='memory'?'Analysis uses the unchanged prior business registry; capture does not approve new members.':'All surviving models still use a bounded observed-industry pool, not a production business registry.',
      'Official reference BVPS remains a distinct P/B-specific basis. No provider field is overwritten.',
      'No external fair value or selected multiple is used; outputs are research diagnostics, not new official target prices.']};
}
async function main(args) {
  const options={};
  for(let i=0;i<args.length;i+=2) {
    if(!['--capture-dir','--replay-dir','--out','--cohort'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Usage: [--cohort pcb|memory] --capture-dir NEW_DIRECTORY | --replay-dir DIRECTORY --out NEW_RESULT.json');
    options[args[i]]=args[i+1];
  }
  if(!!options['--capture-dir']===!!options['--replay-dir'])throw new Error('EXACTLY_ONE_CAPTURE_OR_REPLAY_DIRECTORY_REQUIRED');
  const cohort=options['--cohort']??'pcb';if(!['pcb','memory'].includes(cohort))throw new Error('ONLY_PRESPECIFIED_PCB_OR_MEMORY_COHORT_SUPPORTED');
  const directory=resolve(options['--capture-dir']??options['--replay-dir']);
  const input=options['--capture-dir']?await capture(directory,cohort):JSON.parse(await readFile(join(directory,'inputs.json'),'utf8'));
  const result=await evaluatePublicCapture(directory,input),out=options['--out']?resolve(options['--out']):join(directory,'evaluation.json');
  const bytes=JSON.stringify(result,null,2)+'\n';await writeFile(out,bytes,{flag:'wx'});
  process.stdout.write(JSON.stringify({outputPath:out,outputSha256:sha(bytes),summary:result.summary,officialTargetClose:result.officialTargetClose,
    rows:result.rows.map(r=>({ticker:r.ticker,status:r.status,issues:r.issues,price:r.price,financialDate:r.financialDate,
      modelIds:r.modelIds,estimatedFairValue:r.estimatedFairValue,rankingEligible:r.rankingEligible,
      peerIssues:r.comparableMultiples?Object.fromEntries(Object.entries(r.comparableMultiples.taiwanApplicabilityEvidence.models).map(([id,v])=>[id,{count:v.observations.length,issues:v.issues}])):null}))},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
