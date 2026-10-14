import type {DailyCandle} from './price-history.ts';
export type VerifiedHeldSecurityIdentity={
  issuerName:string;issuerCik:string;predecessorCik?:string;cusip:string|null;
  securityType:'common-stock'|'class-a-common-stock'|'depositary-share';
  ordinarySharesPerADS?:number;firstListedDate?:string;continuity?:'one-for-one-successor';
  sourceUrls:readonly string[];verifiedOn:string;
};
/** Source-verified actual holdings only. A directory entry is not a price,
 * financial observation, portfolio quantity or formal model qualification. */
export const VERIFIED_HELD_REFRESH_TARGETS=[
  {ticker:'XOM',market:'US' as const,name:'ExxonMobil Holdings Corporation',sector:'Energy',securityIdentity:{
    issuerName:'ExxonMobil Holdings Corporation',issuerCik:'2115436',predecessorCik:'34088',cusip:'30233Q108',
    securityType:'common-stock' as const,continuity:'one-for-one-successor' as const,verifiedOn:'2026-10-14',
    sourceUrls:['https://investor.exxonmobil.com/company-information/faq',
      'https://www.sec.gov/Archives/edgar/data/34088/000003408826000093/xom-20260630.htm',
      'https://www.sec.gov/Archives/edgar/data/2115436/000003408826000093/0000034088-26-000093-index.htm']}},
  {ticker:'SPCX',market:'US' as const,name:'Space Exploration Technologies Corp.',sector:'Industrials',securityIdentity:{
    issuerName:'Space Exploration Technologies Corp.',issuerCik:'1181412',cusip:'84615Q103',
    securityType:'class-a-common-stock' as const,firstListedDate:'2026-06-12',verifiedOn:'2026-10-14',
    sourceUrls:['https://m.nasdaqtrader.com/TraderNews.aspx?id=DTN2026-8',
      'https://www.sec.gov/Archives/edgar/data/1181412/000162828026052515/spcx-20260804.htm',
      'https://www.sec.gov/Archives/edgar/data/1181412/000162828026052535/spcx-20260630.htm']}},
  {ticker:'TSM',market:'US' as const,name:'Taiwan Semiconductor Manufacturing Company Limited',sector:'Technology',securityIdentity:{
    issuerName:'Taiwan Semiconductor Manufacturing Company Limited',issuerCik:'1046179',cusip:null,
    securityType:'depositary-share' as const,ordinarySharesPerADS:5,verifiedOn:'2026-10-14',
    sourceUrls:['https://www.sec.gov/Archives/edgar/data/1046179/000104617926000201/tsm_20260416.htm',
      'https://investor.tsmc.com/sites/ir/financial-report/2026/TSMC%202026Q2%20Consolidated%20Financial%20Statements_E_0.pdf']}},
] as const;
export function verifiedHeldRefreshTarget(ticker:string,market:string) {
  return market==='US'?VERIFIED_HELD_REFRESH_TARGETS.find(target=>target.ticker===ticker):undefined;
}
/** The old SPCX ETF changed to SPCK. Never splice its bars into the current
 * June12 common-stock history or apply the filing's retroactive5:1 split twice.
 * XOM's July1 1:1 successor preserves price continuity; it is not a split. */
export function verifiedHeldHistory(ticker:string,market:string,meta:{symbol?:string;currency?:string;instrumentType?:string;quoteType?:string;firstTradeDate?:number}|undefined,candles:DailyCandle[]) {
  const target=verifiedHeldRefreshTarget(ticker,market);
  if(!target)return candles;
  // Yahoo v8/chart identifies these frozen equities with instrumentType.
  // An optional quoteType is additional evidence, never a substitute for a
  // missing instrumentType or permission to accept conflicting identities.
  if(meta?.symbol!==ticker||meta.currency!=='USD'||meta.instrumentType!=='EQUITY'
    ||meta.quoteType!==undefined&&meta.quoteType!=='EQUITY')throw Error('QUOTE_SECURITY_IDENTITY_MISMATCH');
  const identity=target.securityIdentity as VerifiedHeldSecurityIdentity;
  if(identity.firstListedDate&&(!Number.isSafeInteger(meta.firstTradeDate)||new Date(meta.firstTradeDate!*1000).toISOString().slice(0,10)!==identity.firstListedDate))throw Error('QUOTE_SECURITY_LISTING_DATE_MISMATCH');
  return identity.firstListedDate?candles.filter(c=>c.date>=identity.firstListedDate!):candles;
}
