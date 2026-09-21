import type { StockInput } from './valuation.ts';
import type { ComparableMultiples } from './market-comparables.ts';
import { isFinancialCompany } from './company-classification.ts';
import { taiwanEarningsOperationsDivergence, taiwanMaterialMinorityClaims, validTaiwanEnterpriseBridgeEvidence } from './taiwan-valuation-evidence.ts';
import { validTaiwanBusinessGroupReference, taiwanBusinessGroupHasMember } from './taiwan-business-groups.ts';
import { validTaiwanShareMetadata } from './taiwan-share-metadata.ts';

const DAY=86400000;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const positive=(v:unknown):v is number=>finite(v)&&v>0;
const incomeMargin=(s:StockInput,net:boolean)=>{
  const income=net?s.financialMetrics?.netIncomePerShare:s.ebitPerShare;
  return finite(income)&&positive(s.revenuePerShare)?income/s.revenuePerShare:null;
};
const validDate=(v:string|undefined)=>!!v&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function validTaiwanComparableEvidence(s:StockInput) {
  const p=s.comparableMultiples;
  if(!p||p.salesMarginRatioLimit!==2||p.market!=='TW'||p.dataBasis!=='ltm'||p.quoteDate!==s.updatedAt
    ||s.market!=='TW'||s.dataBasis!=='ltm'||s.financialMetrics?.currency!=='TWD'||s.financialMetrics?.periodBasis!=='ltm'
    ||!dated(s)||p.asOf!==p.quoteDate||p.sector!==s.industry
    ||!Array.isArray(p.financialDateRange)||p.financialDateRange.length!==2||!p.financialDateRange.every(validDate)||p.financialDateRange[0]>p.financialDateRange[1]
    ||p.financialDateRange.some(d=>{const age=(Date.parse(s.updatedAt!)-Date.parse(d))/DAY;return age<0||age>180;})
    ||p.peerCount<5||!Array.isArray(p.peerTickers)||!p.peerTickers.every(t=>typeof t==='string'&&/^\d{4}$/.test(t))||new Set(p.peerTickers).size!==p.peerCount||p.peerTickers.length!==p.peerCount||p.peerTickers.includes(s.ticker))return false;
  if(s.taiwanBusinessGroup!==undefined) {
    if(!validTaiwanBusinessGroupReference(s)||p.method!=='tw-business-group-same-session-median'
      ||p.peerGroup!==s.taiwanBusinessGroup.id||p.taiwanBusinessRegistryVersion!==s.taiwanBusinessGroup.registryVersion
      ||!p.peerTickers.every(t=>taiwanBusinessGroupHasMember(s.taiwanBusinessGroup!,t)))return false;
  } else if(p.method!=='tw-industry-same-session-median'||p.peerGroup!==industryKey(s)||p.taiwanBusinessRegistryVersion!==undefined)return false;
  const evidence=p.salesMarginEvidence;
  if(!evidence||evidence.targetNetMargin!==incomeMargin(s,true)||evidence.targetOperatingMargin!==incomeMargin(s,false))return false;
  const salesSets:Array<[string[],number]>=[[evidence.psPeerTickers,p.psPeerCount],[evidence.evRevenuePeerTickers,p.evRevenuePeerCount]];
  if(salesSets.some(([tickers,count])=>!Array.isArray(tickers)||tickers.length!==count||new Set(tickers).size!==count||tickers.some(t=>!p.peerTickers!.includes(t))))return false;
  const metrics:Array<[number|null|undefined,number|undefined]>=[
    [p.peMedian,p.pePeerCount],[p.pbMedian,p.pbPeerCount],[p.psMedian,p.psPeerCount],[p.evRevenueMedian,p.evRevenuePeerCount],[p.evEbitdaMedian,p.evEbitdaPeerCount],[p.evEbitMedian,p.evEbitPeerCount]];
  return metrics.every(([value,count])=>value===null||value===undefined||(positive(value)&&Number.isInteger(count)&&count!>=5&&count!<=p.peerCount));
}
export function taiwanEnterpriseAdjustment(s:StockInput) {
  if(!validTaiwanEnterpriseBridgeEvidence(s))return null;
  const nci=s.financialMetrics?.nonControllingBookPerShare;
  if(!finite(s.cashPerShare)||s.cashPerShare<0||!finite(s.debtPerShare)||s.debtPerShare<0||!finite(nci)||nci<0||nci>s.bvps*.25)return null;
  return s.debtPerShare-s.cashPerShare+nci;
}
function median(values:number[]) {
  const a=[...values].sort((a,b)=>a-b),n=a.length;
  return n?(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2:null;
}
function industryKey(s:StockInput) {
  const industry=s.industry?.trim();
  if(!industry || /^(其他|未分類)$|上市公司|上櫃公司/.test(industry))return null;
  if(isFinancialCompany(s)) {
    // Broker trading income is not bank interest income or insurance premiums.
    if(/證券|證$/.test(s.name))return '金融：證券';
    if(/金控|金$/.test(s.name))return '金融：金控';
    if(/銀行|銀$/.test(s.name))return '金融：銀行';
    if(/保險|壽|產$/.test(s.name))return '金融：保險';
    return null;
  }
  return industry;
}
function dated(s:StockInput) {
  if(s.market!=='TW'||s.dataBasis!=='ltm'||s.financialMetrics?.periodBasis!=='ltm'||s.financialMetrics?.currency!=='TWD'||!validDate(s.updatedAt)||!validDate(s.financialDataDate)||!validTaiwanShareMetadata(s))return false;
  const age=(Date.parse(s.updatedAt!)-Date.parse(s.financialDataDate!))/DAY;
  return Number.isFinite(age)&&age>=0&&age<=180&&positive(s.price)&&positive(s.financialMetrics.sharesOutstanding)
    &&s.price*s.financialMetrics.sharesOutstanding>=1e9;
}
/** Independently sourced business/industry peers, not proprietary selected multiples. */
export function buildTaiwanComparableMap(stocks:StockInput[]) {
  const out=new Map<string,ComparableMultiples>();
  const groups=new Map<string,StockInput[]>();
  const businessGroups=new Map<string,StockInput[]>();
  const unique=new Map<string,StockInput>(),conflicts=new Set<string>();
  const bridgeSignature=(s:StockInput)=>{
    const e=s.financialMetrics?.enterpriseBridgeEvidence;
    return [e!==undefined,e?.sourceType,e?.sourceUrl,e?.publishedDate,e?.periodEnd,e?.currency,e?.sharesOutstanding,e?.cashAndInvestments,e?.debtIncludingLeases,e?.cashScope,e?.debtScope];
  };
  const signature=(s:StockInput)=>JSON.stringify([s.name,s.industry,s.market,s.updatedAt,s.financialDataDate,s.dataBasis,s.price,s.eps,s.bvps,s.revenuePerShare,s.ebitdaPerShare,s.ebitPerShare,s.debtPerShare,s.cashPerShare,s.financialMetrics?.currency,s.financialMetrics?.sharesOutstanding,s.financialMetrics?.periodBasis,typeof s.financialMetrics?.shareBasis,s.financialMetrics?.shareBasis,typeof s.financialMetrics?.shareAsOfDate,s.financialMetrics?.shareAsOfDate,typeof s.financialMetrics?.shareSourceField,s.financialMetrics?.shareSourceField,s.financialMetrics?.nonControllingBookPerShare,s.financialMetrics?.ebitdaBasis,s.financialMetrics?.netIncomePerShare,bridgeSignature(s),s.taiwanBusinessGroup!==undefined,s.taiwanBusinessGroup?.id,s.taiwanBusinessGroup?.registryVersion]);
  for(const stock of stocks) {
    const previous=unique.get(stock.ticker);
    if(previous&&signature(previous)!==signature(stock))conflicts.add(stock.ticker);
    else unique.set(stock.ticker,stock);
  }
  const clean=[...unique.values()].filter(s=>!conflicts.has(s.ticker));
  for(const stock of clean) {
    if(!dated(stock))continue;
    // Do not remove classified members from another target's original industry pool.
    const key=industryKey(stock);
    if(key) {
      const group=key+'|'+stock.updatedAt;
      groups.set(group,[...(groups.get(group)??[]),stock]);
    }
    if(validTaiwanBusinessGroupReference(stock)) {
      const group=stock.taiwanBusinessGroup!.id+'|'+stock.updatedAt;
      businessGroups.set(group,[...(businessGroups.get(group)??[]),stock]);
    }
  }
  for(const s of clean) {
    if(!dated(s))continue;
    const business=s.taiwanBusinessGroup!==undefined;
    if(business&&!validTaiwanBusinessGroupReference(s))continue;
    const key=business?s.taiwanBusinessGroup!.id:industryKey(s);if(!key)continue;
    const peers=((business?businessGroups:groups).get(key+'|'+s.updatedAt)??[]).filter(p=>p.ticker!==s.ticker);
    if(peers.length<5)continue;
    const metric=(get:(p:StockInput)=>number|undefined,cap:number) => {
      const observations=peers.map(p=>({ticker:p.ticker,value:get(p)})).filter((p):p is {ticker:string;value:number}=>positive(p.value)&&p.value<=cap);
      const values=observations.map(p=>p.value).sort((a,b)=>a-b);
      // Reject a heterogeneous middle half rather than inventing a sector multiple.
      const q1=values[Math.floor((values.length-1)*.25)],q3=values[Math.ceil((values.length-1)*.75)];
      return {value:values.length>=5&&q3/q1<=4?median(values):null,count:values.length,tickers:observations.map(p=>p.ticker).sort()};
    };
    const ev=(p:StockInput)=>{const bridge=taiwanEnterpriseAdjustment(p);return bridge===null?undefined:p.price+bridge;};
    const evRatio=(p:StockInput,denominator:number|undefined)=>positive(ev(p))&&positive(denominator)?ev(p)!/denominator:undefined;
    const pe=metric(p=>positive(p.eps)&&!taiwanEarningsOperationsDivergence(p)?p.price/p.eps:undefined,300);
    const pb=metric(p=>positive(p.bvps)?p.price/p.bvps:undefined,30);
    // Sales multiples are strongly margin-dependent. Select comparable
    // observations instead of changing the observed multiple with a PE cap.
    // Factor 2 is a disclosed research assumption, not an external AI rule.
    const similarMargin=(p:StockInput,net:boolean)=>{
      const a=incomeMargin(s,net),b=incomeMargin(p,net);
      return positive(a)&&positive(b)&&b/a>=.5&&b/a<=2;
    };
    const ps=metric(p=>positive(p.revenuePerShare)&&!taiwanMaterialMinorityClaims(p)&&similarMargin(p,true)?p.price/p.revenuePerShare:undefined,50);
    const er=metric(p=>similarMargin(p,false)?evRatio(p,p.revenuePerShare):undefined,50),ee=metric(p=>p.financialMetrics?.ebitdaBasis==='operating-income-plus-cashflow-da'&&!taiwanEarningsOperationsDivergence(p)?evRatio(p,p.ebitdaPerShare):undefined,100),ei=metric(p=>!taiwanEarningsOperationsDivergence(p)?evRatio(p,p.ebitPerShare):undefined,100);
    const dates=peers.map(p=>p.financialDataDate!).sort();
    out.set(s.ticker,{market:'TW',sector:s.industry!,peerGroup:key,peerCount:peers.length,
      peMedian:pe.value,pePeerCount:pe.count,pbMedian:pb.value,pbPeerCount:pb.count,
      psMedian:ps.value,psPeerCount:ps.count,evRevenueMedian:er.value,evRevenuePeerCount:er.count,
      evEbitdaMedian:ee.value,evEbitdaPeerCount:ee.count,evEbitMedian:ei.value,evEbitPeerCount:ei.count,
      pFfoMedian:null,pFfoPeerCount:0,dataBasis:'ltm',asOf:s.updatedAt!,quoteDate:s.updatedAt!,
      financialDateRange:[dates[0],dates.at(-1)!],peerTickers:peers.map(p=>p.ticker).sort(),salesMarginRatioLimit:2,
      salesMarginEvidence:{targetNetMargin:incomeMargin(s,true),targetOperatingMargin:incomeMargin(s,false),psPeerTickers:ps.tickers,evRevenuePeerTickers:er.tickers},
      ...(business?{taiwanBusinessRegistryVersion:s.taiwanBusinessGroup!.registryVersion}:{}),
      method:business?'tw-business-group-same-session-median':'tw-industry-same-session-median'});
  }
  return out;
}
