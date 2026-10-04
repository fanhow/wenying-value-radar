/** Partial, code-reviewed source ledger. It neither adjusts inputs nor certifies unlisted issuers. */
export const TAIWAN_SHARE_BASIS_REVIEW_VERSION='tw-share-basis-review-2026-10-03-v2';
export const TAIWAN_SHARE_BASIS_REVIEW_ISSUE='TW_SHARE_BASIS_REVIEW_REQUIRED';
export type TaiwanShareBasisEventDateBasis='announced-scheduled-new-share-listing'|'announced-capital-reduction-basis-date';
export type TaiwanShareBasisReviewSource=Readonly<{
  url:string;
  publicationDate:string|null;
  descriptionZh:string;
  sha256:string;
}>;

export type TaiwanShareBasisReviewResolution=Readonly<{
  action:'clear-review';
  caseId:string;
  ticker:string;
  listingBoard:'TWSE'|'TPEX';
  reviewedOn:string;
  reasonZh:string;
  bridge:'price-and-all-per-share-inputs';
  sources:readonly TaiwanShareBasisReviewSource[];
}>;

export type TaiwanShareBasisReviewCase=Readonly<{
  caseId:string;
  market:'TW';
  ticker:string;
  issuerName:string;
  listingBoard:'TWSE'|'TPEX';
  disposition:'unresolved'|'resolved';
  reviewedOn:string;
  reasonZh:string;
  eventKind:'par-value-share-exchange'|'cash-capital-reduction';
  eventDate:string;
  eventDateBasis:TaiwanShareBasisEventDateBasis;
  scheduledNewShareListingDate:string;
  scheduledRefundPaymentDate?:string;
  reportedPeriodEnd:string;
  oldParValue?:number;
  newParValue?:number;
  exchangeRatio?:number;
  oldIssuedShares:number;
  newIssuedShares:number;
  cashRefundAmountTwd?:number;
  cancelledShares?:number;
  sources:readonly TaiwanShareBasisReviewSource[];
  resolution?:TaiwanShareBasisReviewResolution;
}>;

export type TaiwanShareBasisReview=Readonly<{
  issue:typeof TAIWAN_SHARE_BASIS_REVIEW_ISSUE;
  market:'TW';
  ticker:string;
  issuerName:string;
  listingBoard:'TWSE'|'TPEX';
  basis:'share-unit-event';
  status:'review-required';
  caseId:string;
  reasonZh:string;
  sourceUrls:readonly string[];
  sources:readonly TaiwanShareBasisReviewSource[];
  reviewedOn:string;
  eventDate:string;
  eventKind:'par-value-share-exchange'|'cash-capital-reduction';
  eventDateBasis:TaiwanShareBasisEventDateBasis;
  scheduledNewShareListingDate:string;
  scheduledRefundPaymentDate?:string;
  actualRefundSettlementVerified?:false;
  actualTradingResumptionVerified:false;
  reportedPeriodEnd:string;
  reviewVersion:typeof TAIWAN_SHARE_BASIS_REVIEW_VERSION;
  coverage:'source-reviewed-cases-only';
}>;

const sources:readonly TaiwanShareBasisReviewSource[]=Object.freeze([
  Object.freeze({url:'https://mopsov.twse.com.tw/mops/web/ajax_t05st01?step=2&firstin=true&off=1&year=115&TYPEK=sii&co_id=6949&month=08&b_date=06&e_date=06&spoke_date=20260806&spoke_time=180407&seq_no=3',publicationDate:'2026-08-06',descriptionZh:'MOPS 18:04:07 換股計畫：普通股每股面額 10 元改為 0.5 元、1 股換發 20 股；公告停止交易 8/27–9/4、新股預定 9/7 上市。公告日期不等於獨立核證實際成交日期。',sha256:'cc9a4ded6bbf20ad32dd616c72a5ff2eb274f6a05a88f01808050c06bd45f821'}),
  Object.freeze({url:'https://mopsov.twse.com.tw/mops/web/ajax_t05st01?step=2&firstin=true&off=1&year=115&TYPEK=sii&co_id=6949&month=08&b_date=06&e_date=06&spoke_date=20260806&spoke_time=180308&seq_no=2',publicationDate:'2026-08-06',descriptionZh:'MOPS 18:03:08 面額變更公告：原發行 65,580,050 股、換發後 1,311,601,000 股；不是將供應商 6/30 財報每股資料直接除以 20 的核證橋接。',sha256:'e328e8045b33dbb75ff04c456583c40ee85f20cff2e53518cecda6072670b4a5'}),
  Object.freeze({url:'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',publicationDate:'2026-10-02',descriptionZh:'證交所基本資料 10/2 出表：6949 普通股面額 0.5000 元、已發行 1,311,601,000 股；不代表 6/30 財報或全部每股序列已完成新股口徑重編。',sha256:'9f8d5ec72152c480d08a0376c22f580344427c7990d23047be998e8d5b5f5198'}),
]);
const capitalReductionSources:readonly TaiwanShareBasisReviewSource[]=Object.freeze([
  Object.freeze({
    url:'https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=6176&SYEAR=2026&SSEASON=2&REPORT_ID=C',
    publicationDate:null,
    descriptionZh:'MOPS 115Q2 合併 XBRL：6/30 歸母權益 36,299,378 仟元、普通股股本上半年未減；現金減資列重大期後事項。7/30 是董事會通過發布日期，最早 MOPS 上傳時間未知，不能據此宣稱完整 PIT。',
    sha256:'915608b03789c9a971fb57c3043205cc0dcd35664a2457624196816b2565cb55',
  }),
  Object.freeze({
    url:'https://mopsov.twse.com.tw/mops/web/ajax_t05st01?step=2&firstin=true&off=1&year=115&month=06&b_date=30&e_date=30&TYPEK=sii&co_id=6176&spoke_date=20260630&spoke_time=163401&seq_no=1',
    publicationDate:'2026-06-30',
    descriptionZh:'MOPS 6/30 16:34:01：現金減資申報 6/29 生效、減資基準日 7/1；申報生效、基準日與會計認列、退款結清是不同日期。',
    sha256:'574ba82c163d0681788a4dbb3283ba9eb6ed3abe02370faff1f9867188000289',
  }),
  Object.freeze({
    url:'https://mopsov.twse.com.tw/mops/web/ajax_t05st01?step=2&firstin=true&off=1&year=115&month=07&b_date=21&e_date=21&TYPEK=sii&co_id=6176&spoke_date=20260721&spoke_time=170553&seq_no=8',
    publicationDate:'2026-07-21',
    descriptionZh:'MOPS 7/21 17:05:53：減資退款 1,162,568,160 元、銷除 116,256,816 股；減資後、後續買回前流通股 345,180,947，恰等於原生標示 6/30 的分母。新股預定 8/24 交易、退款預定 8/31；公告前後 BVPS 明示 Q1，不能用作 Q2 或已完成退款後帳面值。',
    sha256:'54db8d007d9d3920e1790c60f0e2ad91065247b96aa814e52e8faafaa797a64e',
  }),
  Object.freeze({
    url:'https://mopsov.twse.com.tw/mops/web/ajax_t05st01?step=2&firstin=true&off=1&year=115&month=09&b_date=30&e_date=30&TYPEK=sii&co_id=6176&spoke_date=20260930&spoke_time=184948&seq_no=1',
    publicationDate:'2026-09-30',
    descriptionZh:'MOPS 9/30 18:49:48：實際買回 8,132,000 股（減資後）、金額 868,373,822 元、累計本公司庫藏股 11,721,500。與合併 6/30 庫藏股範圍及日期不同，不能單靠公告相減合成 10/2 流通股數或新的權益。',
    sha256:'98c5d4d81ea35481711edab0d5cf2dea9095cd725ba1b7c4c99b5fbafe26f57b',
  }),
]);
/** Announced scheduling and current share data do not prove actual trading or a provider bridge. */
export const TAIWAN_SHARE_BASIS_REVIEW_CASES:readonly TaiwanShareBasisReviewCase[]=Object.freeze([
  Object.freeze({
    caseId:'tw-6949-par-share-exchange-2026',
    market:'TW',ticker:'6949',issuerName:'沛爾生醫',listingBoard:'TWSE',
    disposition:'unresolved',reviewedOn:'2026-10-03',
    reasonZh:'6949 已核證普通股面額 10 元改為 0.5 元、1 股換發 20 股。舊財報每股資料與換股後股價尚缺一致且可追溯的每股口徑橋接；暫停自動估值、估值排序及財務四因子，保留原始 EPS、淨值、股數與 K 線，不推定調整後公允價值。這是個別來源覆核，未列入者不代表已通過全市場股份事件檢查。',
    // This is the announced scheduled date, not independently verified resumption.
    eventKind:'par-value-share-exchange',eventDateBasis:'announced-scheduled-new-share-listing',
    eventDate:'2026-09-07',scheduledNewShareListingDate:'2026-09-07',reportedPeriodEnd:'2026-06-30',
    oldParValue:10,newParValue:.5,exchangeRatio:20,
    oldIssuedShares:65580050,newIssuedShares:1311601000,sources,
  }),
  Object.freeze({
    caseId:'tw-6176-cash-capital-reduction-2026',
    market:'TW',ticker:'6176',issuerName:'瑞儀',listingBoard:'TWSE',
    disposition:'unresolved',reviewedOn:'2026-10-03',eventKind:'cash-capital-reduction',
    reasonZh:'6176 已核證現金減資及季後庫藏股買回。原生以 6/30 歸母權益除以公告減資後、後續買回前股數；尚缺報價日一致的退款、權益、普通股與每股流量完整橋接。暫停自動估值、估值排序及財務四因子，保留原始 EPS、淨值、股數與 K 線，不以減資比例修正目標價，也不重扣已認列股利。這是個別來源覆核，未列入者不代表全市場股份事件已檢查。',
    eventDate:'2026-07-01',eventDateBasis:'announced-capital-reduction-basis-date',
    scheduledNewShareListingDate:'2026-08-24',scheduledRefundPaymentDate:'2026-08-31',reportedPeriodEnd:'2026-06-30',
    oldIssuedShares:465027263,newIssuedShares:348770447,
    cashRefundAmountTwd:1162568160,cancelledShares:116256816,sources:capitalReductionSources,
  }),
]);
const isoDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
function validSource(source:TaiwanShareBasisReviewSource,reviewedOn:string){
  if(!source||!isoDate(source.publicationDate)||source.publicationDate>reviewedOn||!source.descriptionZh?.trim()||!/^[a-f0-9]{64}$/.test(source.sha256))return false;
  try{const u=new URL(source.url);return u.protocol==='https:'&&!u.username&&!u.password&&source.url===source.url.trim();}catch{return false;}
}
function explicitlyResolved(c:TaiwanShareBasisReviewCase){
  const r=c.resolution;
  return c.disposition==='resolved'&&!!r&&r.action==='clear-review'&&r.caseId===c.caseId&&r.ticker===c.ticker&&r.listingBoard===c.listingBoard
    &&r.bridge==='price-and-all-per-share-inputs'&&isoDate(r.reviewedOn)&&r.reviewedOn>=c.reviewedOn&&!!r.reasonZh?.trim()
    &&Array.isArray(r.sources)&&r.sources.length>0&&r.sources.every(s=>validSource(s,r.reviewedOn));
}
type ReviewInput={market:string;ticker:string;source?:string};
/** Only trusted ledger revisions can clear a case; provider/browser flags or newer dates cannot. */
export function evaluateTaiwanShareBasisReview(input:ReviewInput|null|undefined,cases:readonly TaiwanShareBasisReviewCase[]):TaiwanShareBasisReview|null{
  if(input?.market!=='TW'||typeof input.ticker!=='string')return null;
  const ticker=input.ticker.trim().toUpperCase().replace(/\.(TW|TWO)$/,'');
  const c=cases.find(r=>r.market==='TW'&&r.ticker===ticker&&!explicitlyResolved(r));
  if(!c)return null;
  const sourceCopy=Object.freeze(c.sources.map(s=>Object.freeze({...s})));
  return Object.freeze({
    issue:TAIWAN_SHARE_BASIS_REVIEW_ISSUE,market:'TW',ticker,issuerName:c.issuerName,listingBoard:c.listingBoard,
    basis:'share-unit-event',status:'review-required',caseId:c.caseId,reasonZh:c.reasonZh,
    sourceUrls:Object.freeze(sourceCopy.map(s=>s.url)),sources:sourceCopy,reviewedOn:c.reviewedOn,
    eventKind:c.eventKind,eventDate:c.eventDate,eventDateBasis:c.eventDateBasis,
    scheduledNewShareListingDate:c.scheduledNewShareListingDate,
    ...(c.scheduledRefundPaymentDate?{scheduledRefundPaymentDate:c.scheduledRefundPaymentDate,actualRefundSettlementVerified:false as const}:{}),
    actualTradingResumptionVerified:false,
    reportedPeriodEnd:c.reportedPeriodEnd,reviewVersion:TAIWAN_SHARE_BASIS_REVIEW_VERSION,coverage:'source-reviewed-cases-only',
  });
}
/** Explicit user-managed inputs are reversible exceptions, not automatic source clearance. */
export function getTaiwanShareBasisReview(input:ReviewInput|null|undefined):TaiwanShareBasisReview|null{
  if(input?.source==='手動輸入'||input?.source==='方舟截圖')return null;
  return evaluateTaiwanShareBasisReview(input,TAIWAN_SHARE_BASIS_REVIEW_CASES);
}
