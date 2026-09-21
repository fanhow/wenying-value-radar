import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PB_CASES,parseCurrentPbSource,comparePublishedPb,auditCurrentPbBasis} from '../scripts/audit-taiwan-current-pb-basis.mjs';
import {OFFICIAL_BOOK_SOURCES} from '../scripts/audit-taiwan-official-book.mjs';

// All fixture values are synthetic, not real company observations.
const sha=v=>createHash('sha256').update(v).digest('hex');
function capture(ticker='6176',close=false,change=()=>{}) {
  const i=PB_CASES.find(i=>i.ticker===ticker),tw=i.board==='TWSE';
  const fields=close?['日期','成交股數','成交金額','開盤價','最高價','最低價','收盤價','漲跌價差','成交筆數','註記']
    :['日期','殖利率(%)','股利年度','本益比','股價淨值比','財報年/季'];
  const data=close?[['115/09/18','1000','40000','39.00','40.00','39.00','40.00','1.00','10','']]
    :[[tw?'115年09月18日':'115/09/18','2.00',114,'8.00','4.00',tw?'115/2':'115Q2']];
  const table={title:close?`115年09月 ${ticker} ${i.name} 各日成交資訊`
    :tw?`115年09月 ${i.name} 個股日本益比、殖利率及股價淨值比(以個股月查詢)`
      :'上櫃股票個股本益比、殖利率、股價淨值比(依代碼查詢)',
    fields,data,totalCount:1,...(!tw?{date:'115年09月',subtitle:`${ticker} ${i.name} 115年09月`}:{})};
  const body=tw?{stat:'OK',date:close?'20260901':'20260918',...table}:{stat:'ok',date:'20260901',tables:[table]};
  change(body,table);const rawBody=JSON.stringify(body);
  return {...i,httpStatus:200,error:null,retrievedAt:'2026-09-21T02:00:00.000Z',rawBody,rawSha256:sha(rawBody),
    httpMethod:tw?'GET':'POST',requestBody:tw?null:`date=2026%2F09%2F01&code=${ticker}&response=json`,
    sourceURL:close?`https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260901&stockNo=${ticker}&response=json`
      :tw?`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=20260918&stockNo=${ticker}&response=json`
        :'https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryStock'};
}
test('fixed exact-date parser distinguishes TWSE, TPEx and direct close sources',()=>{
  const tw=parseCurrentPbSource(capture()),otc=parseCurrentPbSource(capture('1580')),close=parseCurrentPbSource(capture('6176',true),{close:true});
  assert.equal(tw.value,4);assert.equal(otc.financialPeriodEnd,'2026-06-30');assert.equal(close.value,40);
  assert.equal(close.metric,'official-close');assert.equal(close.financialPeriodEnd,null);
  assert.equal(tw.observationDate,'2026-09-18');assert.equal(tw.laterRowsExcluded,0);
});
test('exact source, request, hash, HTTP and time required',()=>{
  for(const patch of [{board:'TPEx'},{ticker:'9999'},{sourceURL:'https://example.com/'},{rawSha256:'x'},
    {httpStatus:500},{error:'TimeoutError'},{retrievedAt:'2026-02-30T02:00:00.000Z'},
    {retrievedAt:'2026-09-18T02:00:00.000Z'},{httpMethod:'POST'},{requestBody:'date=20260918'}])assert.throws(()=>parseCurrentPbSource({...capture(),...patch}));
  assert.throws(()=>parseCurrentPbSource(capture(),{close:'false'}));
});
test('exact fields and order-independent mapping; bad identity/count/duplicates rejected',()=>{
  const reordered=capture('1580',false,(_b,t)=>{t.fields.reverse();t.data.forEach(r=>r.reverse());});
  assert.equal(parseCurrentPbSource(reordered).value,4);
  for(const change of [(b)=>{b.date='20260917';},(b)=>{b.title='wrong issuer';},(b)=>{b.totalCount=2;},
    (b)=>{b.fields[4]='日期';},(b)=>{b.data[0].pop();},(b)=>{b.data.push(b.data[0]);b.totalCount=2;}])assert.throws(()=>parseCurrentPbSource(capture('6176',false,change)));
  assert.throws(()=>parseCurrentPbSource(capture('1580',false,(b,t)=>{b.tables.push(t);})),/DUPLICATE_PRIMARY_TABLE/);
});
test('future rows do not replace exact date; missing, malformed or wrong-quarter target never falls back',()=>{
  const c=capture('1580',false,(_b,t)=>{t.data.push(['115/09/21','2.00',114,'99.00','99.00','115Q2']);t.totalCount=2;});
  const r=parseCurrentPbSource(c);assert.equal(r.value,4);assert.equal(r.laterRowsExcluded,1);
  for(const date of ['115/09/17','115/09/32','115/08/18'])assert.throws(()=>parseCurrentPbSource(capture('1580',false,(_b,t)=>{t.data[0][0]=date;})));
  assert.throws(()=>parseCurrentPbSource(capture('1580',false,(_b,t)=>{t.data[0][5]='115Q1';})),/FINANCIAL_PERIOD/);
  for(const v of ['--','0.00','-1.00','4.000',null,true])assert.throws(()=>parseCurrentPbSource(capture('1580',false,(_b,t)=>{t.data[0][4]=v;})));
});
test('rounding compatibility is separate from value identity and handles invalid arithmetic',()=>{
  assert.equal(comparePublishedPb(40,10,4).withinHalfUnitAtTwoDecimals,true);
  assert.equal(comparePublishedPb(40,20,4).withinHalfUnitAtTwoDecimals,false);
  assert.equal(comparePublishedPb(40.04,10,4).withinHalfUnitAtTwoDecimals,true);
  assert.equal(comparePublishedPb(40.06,10,4).withinHalfUnitAtTwoDecimals,false);
  for(const tuple of [[0,1,1],[1,0,1],[1,1,null],[1,1,Infinity],[Number.MAX_VALUE,Number.MIN_VALUE,1]])assert.equal(comparePublishedPb(...tuple),null);
});
function joinedFixture() {
  const input={records:PB_CASES.map(i=>({ticker:i.ticker,market:'TW',status:'ready',quoteDate:'2026-09-18',financialDate:'2026-06-30',stock:{
    ticker:i.ticker,name:i.name,market:'TW',listingBoard:i.board,financialDataDate:'2026-06-30',updatedAt:'2026-09-18',
    price:40,bvps:20,financialMetrics:{currency:'TWD',sharesOutstanding:1000}}}))};
  const books=['TWSE','TPEx'].map(board=>({board,sourceURL:OFFICIAL_BOOK_SOURCES[board],retrievedAt:'2026-09-21T02:00:00.000Z',
    rawBody:JSON.stringify(PB_CASES.filter(i=>i.board===board).map(i=>({
      [board==='TWSE'?'公司代號':'SecuritiesCompanyCode']:i.ticker,[board==='TWSE'?'公司名稱':'CompanyName']:i.name,
      [board==='TWSE'?'出表日期':'Date']:'1150921',年度:'115',季別:'2',每股參考淨值:'10.00',歸屬於母公司業主之權益合計:'10'})))}));
  return {input,books,pbs:PB_CASES.map(i=>capture(i.ticker)),closes:['6176','8213'].map(t=>capture(t,true))};
}
test('join keeps all five cases, distinguishes corroborated close and cannot infer missing matches',()=>{
  const {input,books,pbs,closes}=joinedFixture(),original=JSON.stringify(input);
  const r=auditCurrentPbBasis(input,books,pbs,closes);assert.equal(r.rows.length,5);
  assert.ok(r.rows.every(r=>r.officialReferenceComparison.withinHalfUnitAtTwoDecimals&&!r.vendorBookComparison.withinHalfUnitAtTwoDecimals));
  assert.equal(r.rows[0].quoteSource,'official-close-corroborated');assert.equal(r.rows[2].quoteSource,'frozen-vendor-only');
  assert.equal(JSON.stringify(input),original);
  const missing=auditCurrentPbBasis(input,books,[],[]);assert.ok(missing.rows.every(r=>r.reasons.includes('MISSING_PUBLISHED_PB')&&r.officialReferenceComparison===null));
  assert.throws(()=>auditCurrentPbBasis(input,books,[...pbs,pbs[0]],closes),/DUPLICATE_JOIN_KEY/);
  input.records[0].stock.price=41;
  const conflict=auditCurrentPbBasis(input,books,pbs,closes).rows[0];assert.ok(conflict.reasons.includes('OFFICIAL_CLOSE_DISAGREEMENT'));assert.equal(conflict.vendorBookComparison,null);
  assert.equal(conflict.quoteSource,'official-close-conflict');
});
test('join refuses stale quote or mismatched official period instead of repairing inputs',()=>{
  const {input,books,pbs,closes}=joinedFixture();input.records[1].quoteDate='2026-09-17';
  const r=auditCurrentPbBasis(input,books,pbs,closes);assert.ok(r.rows[1].reasons.includes('VENDOR_QUOTE_MISMATCH'));
  assert.equal(r.rows[1].quoteSource,'official-close-present-unverified');
  assert.equal(r.rows[1].officialReferenceComparison,null);
  const b=JSON.parse(books[0].rawBody);b[2]['季別']='1';books[0].rawBody=JSON.stringify(b);
  assert.equal(auditCurrentPbBasis(input,books,pbs,closes).rows[2].officialReferenceComparison,null);
});
test('an invalid vendor quote cannot be labeled corroborated merely because a close exists',()=>{
  const {input,books,pbs,closes}=joinedFixture();input.records[0].stock.price=null;input.records[2].quoteDate='2026-09-17';
  const r=auditCurrentPbBasis(input,books,pbs,closes);
  assert.equal(r.rows[0].quoteSource,'official-close-present-unverified');assert.equal(r.rows[0].officialReferenceComparison,null);
  assert.equal(r.rows[2].quoteSource,'unavailable');assert.equal(r.rows[2].vendorBookComparison,null);
});

test('same price and date cannot corroborate a quote from a different identity',()=>{
  for(const patch of [{ticker:'8213'},{market:'US'},{listingBoard:'TPEx'}]){
    const {input,books,pbs,closes}=joinedFixture();Object.assign(input.records[0].stock,patch);
    const r=auditCurrentPbBasis(input,books,pbs,closes).rows[0];
    assert.equal(r.quoteSource,'official-close-present-unverified');
    assert.ok(r.reasons.includes('VENDOR_QUOTE_MISMATCH'));assert.equal(r.officialReferenceComparison,null);
  }
  const {input,books,pbs,closes}=joinedFixture();input.records[0].market='US';
  assert.equal(auditCurrentPbBasis(input,books,pbs,closes).rows[0].quoteSource,'official-close-present-unverified');
});
