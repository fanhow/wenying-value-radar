import {CBC_QUOTE_DATE_FX_SOURCE,validCbcQuoteDateFx,type CbcQuoteDateFx} from './cbc-quote-date-fx.ts';
export {CBC_QUOTE_DATE_FX_SOURCE} from './cbc-quote-date-fx.ts';
import type {StockInput} from './valuation.ts';

export const TSMC_TIFRS_ADAPTER_VERSION='tsmc-tifrs-2026H1-ordinary-ads-v1';
export const TSMC_TIFRS_SOURCES=[
  'https://investor.tsmc.com/sites/ir/financial-report/2026/TSMC%202026Q2%20Consolidated%20Financial%20Statements_E_0.pdf',
  'https://investor.tsmc.com/sites/ir/financial-report/2025/TSMC%202025Q4%20Consolidated%20Financial%20Statements_E.pdf',
  'https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-07/a80d7933be643644081584087731f73b22ea5a2c/2Q26%20EarningsRelease.pdf',
] as const;
const END='2026-06-30',SHARES=25932370*1000;
const iso=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)
  &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
type Payload={timeseries?:{error?:unknown;result?:Array<{meta?:{type?:string[];symbol?:string[]};[key:string]:unknown}>}};
export type TsmcOfficialAdapter={version:typeof TSMC_TIFRS_ADAPTER_VERSION;issuerCik:'1046179';accountingBasis:'Taiwan-IFRS';
  periodEnd:'2026-06-30';periodStart:'2025-07-01';earningsAnnouncementDate:'2026-07-16';statementAuthorizedDate:'2026-08-11';filedDate:'2026-08-14';fullStatementPublishedDate:null;
  sharePrecision:'thousand-ordinary-shares';ordinaryShares:number;ordinarySharesPerSecurity:1|5;
  epsBasis:'published-period-eps-bridge-proxy';capexBasis:'cash-ppe-rou-intangibles-lease-prepayments';
  financialCurrency:'TWD';quoteCurrency:'TWD'|'USD';quoteDate:string;
  quoteFxTwdPerUsd:number|null;quoteFxDate:string|null;quoteFxSource:string|null;
  quoteFxBasis:'same-civil-date-CBC-interbank-close-not-NYSE-close'|null;quoteFxEvidence:CbcQuoteDateFx|null;
  sourceUrls:string[];providerQuarterlyAnchor:'2026-06-30';providerFinancialFetchedAt:string;
  enterpriseBridgeStatus:'unverified';ttmWeightedDilutedShares:null};
/** Fixed primary facts, not a provider-basis guess. This prospective adapter
 * runs before the producer builds peers and applies only to a fresh verified
 * June anchor. Rounded issuer ordinary shares are not the provider's 67-share
 * suffix. EPS bridge is a proxy; no precise 12-month weighted denominator is
 * implied. The unknown EV cash classification stays unknown.
 * Same civil-date FX comes only from a bounded strict official CBC parser. */
export function tsmcTifrsInputs(ticker:string,payload:Payload,quoteDate:string,now:Date,quoteFx?:CbcQuoteDateFx):Partial<StockInput>|null {
  const symbol=ticker==='2330'?'2330.TW':ticker==='TSM'?'TSM':null;
  const rows=payload.timeseries?.result,age=(now.getTime()-Date.parse(END))/86400000;
  if(!symbol||!iso(quoteDate)||quoteDate<'2026-08-15'||Date.parse(quoteDate)>now.getTime()||payload.timeseries?.error||!Array.isArray(rows)||!rows.length
    ||!Number.isFinite(age)||age<0||age>180||now.getTime()<Date.parse('2026-08-15T12:00:00Z'))return null;
  if(rows.some(row=>!Array.isArray(row.meta?.symbol)||row.meta.symbol.length!==1||row.meta.symbol[0]!==symbol))return null;
  let anchor=false;
  for(const row of rows){const type=row.meta?.type?.[0],points=type?row[type]:undefined;
    if(!Array.isArray(points))continue;
    for(const point of points){
      if(iso(point?.asOfDate)&&point.asOfDate>END)return null;
      if(type==='quarterlyTotalRevenue'&&point?.asOfDate===END&&point.periodType==='3M'
        &&point.currencyCode==='TWD'&&typeof point.reportedValue?.raw==='number'&&Number.isFinite(point.reportedValue.raw)&&point.reportedValue.raw>0)anchor=true;
    }
  }
  if(!anchor)return null;
  const adr=ticker==='TSM';
  if(adr&&!validCbcQuoteDateFx(quoteFx,quoteDate))return null;
  const fx=adr?quoteFx!.twdPerUsd:null;
  const ratio=adr?5:1,factor=ratio/(fx??1);
  const net=(1717882627+1279041690-759837230)*1000;
  const revenue=(3809054272+2404483690-1773045533)*1000;
  const cfo=(2274975625+1482341242-1122637757)*1000;
  // Keep the explicitly reconstructed TW cash-capex scope, not the US PPE-only rule.
  const capex=(1282597311+860101111-632686163)*1000;
  const equity=6432518334*1000,averageEquity=(4581073975+6432518334)*1000/2;
  const perShare=(amount:number)=>amount/SHARES*factor;
  const eps=(66.25+49.32-29.30)*factor;
  const assets=9375654727*1000,liabilities=2901183746*1000;
  const operatingIncome=(1936091677+1425568793-870504446)*1000;
  const revenueGrowth=(1270380250/933791869-1)*100;
  const result:Partial<StockInput>={eps,bvps:perShare(equity),fcfPerShare:perShare(cfo-capex),revenuePerShare:perShare(revenue),
    roe:net/averageEquity*100,revenueGrowth,debtRatio:liabilities/assets*100,ebitPerShare:perShare(operatingIncome),
    assetTurnover:revenue/assets,financialLeverage:assets/equity,financialDataDate:END,dataBasis:'ltm',dataCompleteness:'historical',qualityAvailable:true,
    netMargin:net/revenue*100,netMarginUnit:'percent',epsHistory:[{value:66.25*(adr?5/(fx??1):1),end:'2025-12-31',basis:'annual'}],
    financialMetrics:{currency:adr?'USD':'TWD',periodBasis:'ltm',shareBasis:'issuer-period-end-ordinary-rounded',
      shareAsOfDate:END,shareSourceField:'issuer-reported-thousand-ordinary-shares',sharesOutstanding:SHARES,ordinarySharesPerSecurity:ratio,
      roeBasis:'parent-income-average-equity',growthBasis:'quarter-yoy',revenueGrowthQuarterYoY:revenueGrowth,netIncomePerShare:perShare(net),
      nonControllingBookPerShare:perShare(41952647*1000),epsBasis:'quarter-eps-sum-proxy',
      epsSourceField:'issuer-published-period-diluted-eps-bridge',epsAsOfDate:END,
      fcfBasis:'issuer-cfo-minus-tw-broad-cash-capex'},
    officialFinancialAdapter:{version:TSMC_TIFRS_ADAPTER_VERSION,issuerCik:'1046179',accountingBasis:'Taiwan-IFRS',
      periodEnd:END,periodStart:'2025-07-01',earningsAnnouncementDate:'2026-07-16',statementAuthorizedDate:'2026-08-11',filedDate:'2026-08-14',fullStatementPublishedDate:null,sharePrecision:'thousand-ordinary-shares',
      ordinaryShares:SHARES,ordinarySharesPerSecurity:ratio,epsBasis:'published-period-eps-bridge-proxy',
      capexBasis:'cash-ppe-rou-intangibles-lease-prepayments',financialCurrency:'TWD',quoteCurrency:adr?'USD':'TWD',quoteDate,
      quoteFxTwdPerUsd:fx,quoteFxDate:adr?quoteDate:null,quoteFxSource:adr?CBC_QUOTE_DATE_FX_SOURCE:null,
      quoteFxBasis:adr?'same-civil-date-CBC-interbank-close-not-NYSE-close':null,quoteFxEvidence:adr?quoteFx!:null,
      sourceUrls:[...TSMC_TIFRS_SOURCES,...(adr?[CBC_QUOTE_DATE_FX_SOURCE]:[])],providerQuarterlyAnchor:END,
      providerFinancialFetchedAt:now.toISOString(),enterpriseBridgeStatus:'unverified',ttmWeightedDilutedShares:null},
    sourceNote:'台積電同 Taiwan-IFRS FY2025＋H1 2026−H1 2025：歸母淨利／營收／CFO 逐欄銜接；FCF 採已揭露 PP&E＋ROU＋無形資產＋租賃預付現金支出組合，不混 US PPE-only 定義。普通股數只核證至千股精度；EPS 86.27 普通股為公布期別橋接 proxy，不是精確十二月 diluted denominator。現金可用分類未核證，企業價值模型停用。'+(adr?'所有同TWD財務每股權利按 ADS5倍與同civil quoteDate CBC銀行間收盤匯率轉USD；這不是NYSE收盤同瞬時匯率、income平均或6/30便利譯數。':'ROE採同準則歸母淨利／期初期末平均母權益。')+'僅供研究，不聲稱外部估值精確對齊。',
  };
  return result;
}
/** Exact named fields and structural consistency, never marker-only clearance.
 * This pure validator does not authenticate self-reported source evidence;
 * the server admits TSM evidence only after its own fixed-source capture.
 * Server/client can validate this without fetching, adding raw fields or
 * recomputing an archived cohort. Required unknown fields remain absent. */
export function validTsmcOfficialInput(input:Partial<StockInput>):boolean {
  const a=input.officialFinancialAdapter;
  if(!a||input.ticker!=='2330'&&input.ticker!=='TSM'||input.market!==(input.ticker==='2330'?'TW':'US')
    ||a.version!==TSMC_TIFRS_ADAPTER_VERSION||a.providerQuarterlyAnchor!==END||!iso(a.providerFinancialFetchedAt?.slice(0,10)))return false;
  const fake={timeseries:{result:[{meta:{type:['quarterlyTotalRevenue'],symbol:[input.ticker==='2330'?'2330.TW':'TSM']},
    quarterlyTotalRevenue:[{asOfDate:END,periodType:'3M',currencyCode:'TWD',reportedValue:{raw:1}}]}]}};
  const expected=tsmcTifrsInputs(input.ticker,fake,input.updatedAt??'',new Date(a.providerFinancialFetchedAt),a.quoteFxEvidence??undefined);
  if(!expected)return false;
  for(const key of ['eps','bvps','fcfPerShare','revenuePerShare','roe','revenueGrowth','debtRatio','ebitPerShare','assetTurnover','financialLeverage','financialDataDate','netMargin','netMarginUnit','dataBasis','dataCompleteness','qualityAvailable','epsHistory'] as const)
    if(JSON.stringify(input[key])!==JSON.stringify(expected[key]))return false;
  if(JSON.stringify(a)!==JSON.stringify(expected.officialFinancialAdapter))return false;
  const metrics=expected.financialMetrics!;
  for(const key of Object.keys(metrics))if(JSON.stringify(input.financialMetrics?.[key as keyof typeof metrics])!==JSON.stringify(metrics[key as keyof typeof metrics]))return false;
  return ['debtPerShare','cashPerShare','ebitdaPerShare'].every(key=>!Object.hasOwn(input,key));
}
