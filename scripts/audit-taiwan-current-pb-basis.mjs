// Fixed, offline source reconciliation. Never computes fair value or inferred shares.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compareTaiwanOfficialBook} from './audit-taiwan-official-book.mjs';
import {parsePublishedMultiple} from './study-taiwan-historical-multiples.mjs';

export const PB_OBSERVATION_DATE='2026-09-18';
export const PB_CASES=Object.freeze([
  {ticker:'6176',name:'瑞儀',board:'TWSE'},{ticker:'8213',name:'志超',board:'TWSE'},
  {ticker:'3592',name:'瑞鼎',board:'TWSE'},{ticker:'1580',name:'新麥',board:'TPEx'},
  {ticker:'8183',name:'精星',board:'TPEx'},
].map(Object.freeze));
const sha=v=>createHash('sha256').update(v).digest('hex');
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const normal=v=>typeof v==='string'?v.trim().replace(/\s+/g,' '):'';
const fieldsEqual=(a,b)=>Array.isArray(a)&&a.length===b.length&&new Set(a).size===b.length&&b.every(f=>a.includes(f));
const pbFields=['日期','殖利率(%)','股利年度','本益比','股價淨值比','財報年/季'];
const closeFields=['日期','成交股數','成交金額','開盤價','最高價','最低價','收盤價','漲跌價差','成交筆數','註記'];
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
function rawDate(value,board,close) {
  const m=typeof value==='string'?(board==='TWSE'&&!close?/^(\d{3})年(\d{2})月(\d{2})日$/:/^(\d{3})\/(\d{2})\/(\d{2})$/).exec(value):null;
  const d=m?`${Number(m[1])+1911}-${m[2]}-${m[3]}`:null;return validDate(d)?d:null;
}
function sourceUrl(c,close) {
  return close?`https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260901&stockNo=${c.ticker}&response=json`
    :c.board==='TWSE'?`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=20260918&stockNo=${c.ticker}&response=json`
      :'https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryStock';
}
/** Exact target date only; no newest-row, nearest-day or period inference. */
export function parseCurrentPbSource(c,{close=false}={}) {
  if(typeof close!=='boolean')throw new Error('INVALID_SOURCE_KIND');
  const i=PB_CASES.find(i=>i.ticker===c?.ticker&&i.board===c?.board);
  if(!i||c.sourceURL!==sourceUrl(c,close)||(close&&!['6176','8213'].includes(c.ticker)))throw new Error('SOURCE_IDENTITY_MISMATCH');
  if(typeof c.rawBody!=='string'||sha(c.rawBody)!==c.rawSha256)throw new Error('RAW_HASH_MISMATCH');
  if(typeof c.retrievedAt!=='string'||!Number.isFinite(Date.parse(c.retrievedAt))||new Date(c.retrievedAt).toISOString()!==c.retrievedAt
    ||c.retrievedAt.slice(0,10)<=PB_OBSERVATION_DATE)throw new Error('INVALID_RETRIEVAL_TIME');
  if(!close&&(c.httpMethod!==(c.board==='TWSE'?'GET':'POST')||c.requestBody!==(c.board==='TWSE'?null:'date=2026%2F09%2F01&code='+c.ticker+'&response=json')))throw new Error('REQUEST_MISMATCH');
  if(c.httpStatus!==200||c.error)throw new Error('SOURCE_REQUEST_FAILED');
  const b=JSON.parse(c.rawBody),t=c.board==='TPEx'?b.tables?.[0]:b;
  if(b.stat!==(c.board==='TWSE'?'OK':'ok')||b.date!==(c.board==='TWSE'&&!close?'20260918':'20260901'))throw new Error('SOURCE_DATE_OR_STATUS_MISMATCH');
  const title=close?`115年09月 ${i.ticker} ${i.name} 各日成交資訊`
    :c.board==='TWSE'?`115年09月 ${i.name} 個股日本益比、殖利率及股價淨值比(以個股月查詢)`
      :'上櫃股票個股本益比、殖利率、股價淨值比(依代碼查詢)';
  if(!t||normal(t.title)!==title||(c.board==='TPEx'&&(normal(t.subtitle)!==`${i.ticker} ${i.name} 115年09月`||t.date!=='115年09月')))throw new Error('TABLE_IDENTITY_MISMATCH');
  if(c.board==='TPEx'&&b.tables.slice(1).some(x=>x?.title===t.title))throw new Error('DUPLICATE_PRIMARY_TABLE');
  const fields=close?closeFields:pbFields;
  if(!fieldsEqual(t.fields,fields)||!Array.isArray(t.data)||(t.total??t.totalCount)!==t.data.length)throw new Error('INVALID_SCHEMA');
  const dated=t.data.map(r=>({raw:r,date:rawDate(r?.[t.fields.indexOf('日期')],c.board,close)}));
  if(dated.some(r=>!Array.isArray(r.raw)||r.raw.length!==fields.length||!r.date||!r.date.startsWith('2026-09-'))
    ||new Set(dated.map(r=>r.date)).size!==dated.length)throw new Error('INVALID_OR_DUPLICATE_ROWS');
  const selected=dated.find(r=>r.date===PB_OBSERVATION_DATE);
  if(!selected)throw new Error('EXACT_DATE_NOT_FOUND');
  const get=f=>selected.raw[t.fields.indexOf(f)];
  if(!close&&get('財報年/季')!==(c.board==='TWSE'?'115/2':'115Q2'))throw new Error('FINANCIAL_PERIOD_MISMATCH');
  const rawValue=get(close?'收盤價':'股價淨值比');
  if(typeof rawValue!=='string'||!/^\d+(?:\.\d{2})$/.test(rawValue))throw new Error('EXPECTED_TWO_DECIMAL_SOURCE');
  const parsed=parsePublishedMultiple(rawValue);if(!positive(parsed.value))throw new Error('NON_POSITIVE_SOURCE_VALUE');
  return {...i,observationDate:PB_OBSERVATION_DATE,financialPeriodEnd:close?null:'2026-06-30',
    metric:close?'official-close':'published-pb',value:parsed.value,decimalPlaces:2,sourceURL:c.sourceURL,
    retrievedAt:c.retrievedAt,rawSha256:c.rawSha256,rawRow:selected.raw,
    laterRowsExcluded:dated.filter(r=>r.date>PB_OBSERVATION_DATE).length};
}
export function comparePublishedPb(price,bvps,publishedPb) {
  if(![price,bvps,publishedPb].every(positive))return null;
  const computedPb=price/bvps,difference=computedPb-publishedPb;
  if(!positive(computedPb)||!Number.isFinite(difference))return null;
  return {computedPb,publishedPb,difference,
    withinHalfUnitAtTwoDecimals:Math.abs(difference)<=.005+Number.EPSILON*Math.max(computedPb,publishedPb)*4};
}
function uniqueMap(items,key) {
  const map=new Map();for(const item of items){const k=key(item);if(map.has(k))throw new Error('DUPLICATE_JOIN_KEY');map.set(k,item);}return map;
}
export function auditCurrentPbBasis(input,bookCaptures,pbCaptures,closeCaptures) {
  const books=compareTaiwanOfficialBook(input,bookCaptures);
  const bookMap=uniqueMap(books.rows.filter(r=>PB_CASES.some(c=>c.ticker===r.ticker)),r=>r.ticker);
  const stockMap=uniqueMap(input.records.filter(r=>PB_CASES.some(c=>c.ticker===r.ticker)),r=>r.ticker);
  const published=uniqueMap(pbCaptures.map(c=>parseCurrentPbSource(c)),r=>r.ticker);
  const closes=uniqueMap(closeCaptures.map(c=>parseCurrentPbSource(c,{close:true})),r=>r.ticker);
  return {version:'current-pb-basis-audit-v1',researchOnly:true,quoteDate:PB_OBSERVATION_DATE,
    limitations:['Current retrieval is not a point-in-time replay.',
      'Half-unit agreement at two decimals is arithmetic compatibility, not proof of the exact denominator or corporate-action treatment.',
      'Official close was checked only for 6176/8213. Other prices remain frozen Yahoo quotes.',
      'No implied book, shares, selected multiple, fair value or upside is produced.'],
    rows:PB_CASES.map(i=>{
      const book=bookMap.get(i.ticker),record=stockMap.get(i.ticker),pb=published.get(i.ticker),close=closes.get(i.ticker),reasons=[];
      if(!book?.comparison)reasons.push('NO_COMPARABLE_OFFICIAL_BOOK');
      if(!pb)reasons.push('MISSING_PUBLISHED_PB');
      const vendorQuoteValid=record?.market==='TW'&&record?.stock?.market==='TW'
        &&record?.stock?.ticker===i.ticker&&record?.stock?.listingBoard===i.board
        &&record?.quoteDate===PB_OBSERVATION_DATE&&record?.stock?.updatedAt===PB_OBSERVATION_DATE&&positive(record?.stock?.price);
      if(!vendorQuoteValid)reasons.push('VENDOR_QUOTE_MISMATCH');
      if(book?.board!==i.board||pb?.board!==i.board||book?.financialDate!==pb?.financialPeriodEnd)reasons.push('BOOK_PB_IDENTITY_OR_PERIOD_MISMATCH');
      const vendorPrice=record?.stock?.price??null;
      const closeDisagrees=!!close&&vendorQuoteValid&&Math.abs(close.value-vendorPrice)>.005;
      if(closeDisagrees)reasons.push('OFFICIAL_CLOSE_DISAGREEMENT');
      const price=close?.value??vendorPrice;
      return {...i,reasons,published:pb??null,officialClose:close??null,vendorPrice,
        quoteSource:close?(vendorQuoteValid?(closeDisagrees?'official-close-conflict':'official-close-corroborated'):'official-close-present-unverified')
          :vendorQuoteValid?'frozen-vendor-only':'unavailable',
        referenceBVPS:book?.comparison?.reportedReferenceBVPS??null,vendorBVPS:book?.comparison?.vendorBVPS??null,
        officialReferenceComparison:reasons.length?null:comparePublishedPb(price,book.comparison.reportedReferenceBVPS,pb.value),
        vendorBookComparison:reasons.length?null:comparePublishedPb(price,book.comparison.vendorBVPS,pb.value)};
    })};
}
async function main(args) {
  if(args.length!==2||args[0]!=='--out')throw new Error('Usage: --out NEW_RESULT_PATH (fixed local inputs; no network)');
  const dir=new URL('../outputs/taiwan-model-audit/',import.meta.url);
  const specs=[['operating-v2/inputs.json','43c2bca489c504ededead8c4f25f0b560d8b78a609537e85eb2184ef4b905c1a'],
    ['official-book-20260921-v2.json','792abe784d4867dc7522afe97fdc27df3f34c1fd00acca15012b2ebc348cc5e1'],
    ['current-pb-source-captures-20260921.json','527c69226d9159c66ab4a31dac186a50785363d6b7d8f846668cfb035ee54742'],
    ['current-pb-official-close-captures-20260921.json','16bb058ce74290130e58980059adc03497b82e3d86f164d28d526bcab2c0cdbe']];
  const values=[];
  for(const [name,hash] of specs){const bytes=await readFile(new URL(name,dir));if(sha(bytes)!==hash)throw new Error('FIXED_INPUT_HASH_MISMATCH '+name);values.push(JSON.parse(bytes.toString('utf8')));}
  const result={...auditCurrentPbBasis(values[0],values[1].captures,values[2].captures,values[3].captures),inputHashes:specs};
  const out=JSON.stringify(result,null,2)+'\n';await writeFile(resolve(args[1]),out,{flag:'wx'});
  process.stdout.write(JSON.stringify({outputSha256:sha(out),...result},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
