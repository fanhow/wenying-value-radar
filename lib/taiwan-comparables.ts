import {getTaiwanShareBasisReview} from './taiwan-share-basis-review.ts';
import type { StockInput } from './valuation.ts';
import type { ComparableMultiples } from './market-comparables.ts';
import { isFinancialCompany } from './company-classification.ts';
import { taiwanEarningsOperationsDivergence, taiwanMaterialMinorityClaims, validTaiwanEnterpriseBridgeEvidence } from './taiwan-valuation-evidence.ts';
import { validTaiwanBusinessGroupReference, taiwanBusinessGroupHasMember } from './taiwan-business-groups.ts';
import { validTaiwanShareMetadata } from './taiwan-share-metadata.ts';
import {TAIWAN_APPLICABILITY_VERSION,TAIWAN_COMPARABLE_MODEL_IDS,taiwanApplicabilityProfile,taiwanPeerApplicable,summarizeTaiwanMultiple,type TaiwanComparableModelId} from './taiwan-multiple-applicability.ts';

const MULTIPLE_FIELDS={pe:['peMedian','pePeerCount'],pb:['pbMedian','pbPeerCount'],'p-sales':['psMedian','psPeerCount'],'ev-revenue':['evRevenueMedian','evRevenuePeerCount'],'ev-ebitda':['evEbitdaMedian','evEbitdaPeerCount'],'ev-ebit':['evEbitMedian','evEbitPeerCount']} as const;
const MULTIPLE_CAPS={pe:300,pb:30,'p-sales':50,'ev-revenue':50,'ev-ebitda':100,'ev-ebit':100} as const;

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
    ||p.financialDateRange.some(d=>d!==s.financialDataDate)
    ||p.financialDateRange.some(d=>{const age=(Date.parse(s.updatedAt!)-Date.parse(d))/DAY;return age<0||age>180;})
    ||!Number.isInteger(p.peerCount)||p.peerCount<0||!Array.isArray(p.peerTickers)||!Array.from(p.peerTickers).every(t=>typeof t==='string'&&/^\d{4}$/.test(t))||new Set(p.peerTickers).size!==p.peerCount||p.peerTickers.length!==p.peerCount||p.peerTickers.includes(s.ticker)||p.peerTickers.some(t=>getTaiwanShareBasisReview({market:'TW',ticker:t})))return false;
  if(s.taiwanBusinessGroup!==undefined) {
    if(!validTaiwanBusinessGroupReference(s)||p.method!=='tw-business-group-same-session-median'
      ||p.peerGroup!==s.taiwanBusinessGroup.id||p.taiwanBusinessRegistryVersion!==s.taiwanBusinessGroup.registryVersion
      ||!p.peerTickers.every(t=>taiwanBusinessGroupHasMember(s.taiwanBusinessGroup!,t)))return false;
  } else if(p.method!=='tw-industry-same-session-median'||p.peerGroup!==industryKey(s)||p.taiwanBusinessRegistryVersion!==undefined)return false;
  const evidence=p.salesMarginEvidence;
  if(!evidence||evidence.targetNetMargin!==incomeMargin(s,true)||evidence.targetOperatingMargin!==incomeMargin(s,false))return false;
  const salesSets:Array<[string[],number]>=[[evidence.psPeerTickers,p.psPeerCount],[evidence.evRevenuePeerTickers,p.evRevenuePeerCount]];
  if(salesSets.some(([tickers,count])=>!Array.isArray(tickers)||tickers.length!==count||new Set(tickers).size!==count||tickers.some(t=>!p.peerTickers!.includes(t))))return false;
  const applicability=p.taiwanApplicabilityEvidence,target=taiwanApplicabilityProfile(s);
  if(!applicability||applicability.version!==TAIWAN_APPLICABILITY_VERSION||applicability.profitabilityRatioLimit!==2
    ||JSON.stringify(applicability.target)!==JSON.stringify(target)||!applicability.models)return false;
  if(p.pFfoMedian!==null||p.pFfoPeerCount!==0)return false;
  return TAIWAN_COMPARABLE_MODEL_IDS.every(id=>{
    const model=applicability.models[id];
    if(!model||!Array.isArray(model.observations)||!Array.isArray(model.issues))return false;
    const tickers=model.observations.map(o=>o?.ticker);
    if(new Set(tickers).size!==tickers.length||Array.from(model.observations).some(o=>!o||!p.peerTickers!.includes(o.ticker)
      ||!positive(o.value)||o.value>MULTIPLE_CAPS[id]||!positive(o.numerator)||!positive(o.denominator)
      ||o.value!==o.numerator/o.denominator||!o.profile||typeof o.profile.financial!=='boolean'
      ||typeof o.profile.roeBasis!=='string'||[o.profile.roe,o.profile.netMargin,o.profile.operatingMargin,o.profile.minorityBookRatio].some(v=>v!==null&&!finite(v))
      ||(o.profile.minorityBookRatio!==null&&o.profile.minorityBookRatio<0)
      ||!taiwanPeerApplicable(id,target,o.profile)))return false;
    const summary=summarizeTaiwanMultiple(id,target,model.observations),[valueField,countField]=MULTIPLE_FIELDS[id];
    const salesTickers=id==='p-sales'?evidence.psPeerTickers:id==='ev-revenue'?evidence.evRevenuePeerTickers:null;
    return p[valueField]===summary.value&&p[countField]===summary.count&&JSON.stringify(model.issues)===JSON.stringify(summary.issues)
      &&(!salesTickers||JSON.stringify([...tickers].sort())===JSON.stringify(salesTickers));
  });
}
export function taiwanEnterpriseAdjustment(s:StockInput) {
  if(!validTaiwanEnterpriseBridgeEvidence(s))return null;
  const nci=s.financialMetrics?.nonControllingBookPerShare;
  if(!finite(s.cashPerShare)||s.cashPerShare<0||!finite(s.debtPerShare)||s.debtPerShare<0||!finite(nci)||nci<0||nci>s.bvps*.25)return null;
  return s.debtPerShare-s.cashPerShare+nci;
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
  // Peer provenance is automatic source evidence, never a manual-label override.
  if(getTaiwanShareBasisReview({...s,source:undefined}))return false;
  if(s.market!=='TW'||s.dataBasis!=='ltm'||s.financialMetrics?.periodBasis!=='ltm'||s.financialMetrics?.currency!=='TWD'
    ||!['period-end-ordinary','provider-as-of-ordinary'].includes(s.financialMetrics?.shareBasis??'')
    ||!validDate(s.updatedAt)||!validDate(s.financialDataDate)||!validTaiwanShareMetadata(s))return false;
  const age=(Date.parse(s.updatedAt!)-Date.parse(s.financialDataDate!))/DAY;
  return Number.isFinite(age)&&age>=0&&age<=180&&positive(s.price)&&positive(s.financialMetrics.sharesOutstanding)
    &&s.price*s.financialMetrics.sharesOutstanding>=1e9;
}
/** Keep only native fields used by peer selection, signatures and observations. */
export function compactTaiwanComparableSource(s:StockInput):StockInput {
  const source:StockInput={ticker:s.ticker,name:s.name,market:s.market,sector:s.sector,price:s.price,eps:s.eps,bvps:s.bvps,
    fcfPerShare:s.fcfPerShare,targetPe:s.targetPe,targetPb:s.targetPb,targetFcfMultiple:s.targetFcfMultiple,
    revenueGrowth:s.revenueGrowth,roe:s.roe,debtRatio:s.debtRatio,uncertainty:s.uncertainty};
  const fields=['industry','updatedAt','financialDataDate','dataBasis','qualityAvailable','revenuePerShare',
    'ebitdaPerShare','ebitPerShare','debtPerShare','cashPerShare','taiwanBusinessGroup'] as const;
  for(const field of fields)if(field in s)Object.assign(source,{[field]:s[field]});
  if(s.taiwanBusinessGroup&&typeof s.taiwanBusinessGroup==='object')source.taiwanBusinessGroup={
    id:s.taiwanBusinessGroup.id,registryVersion:s.taiwanBusinessGroup.registryVersion};
  const m=s.financialMetrics;
  if(m!==undefined) {
    source.financialMetrics=m?{currency:m.currency,periodBasis:m.periodBasis,shareBasis:m.shareBasis,roeBasis:m.roeBasis,growthBasis:m.growthBasis}:m;
    if(m)for(const field of ['sharesOutstanding','shareAsOfDate','shareSourceField','nonControllingBookPerShare',
      'ebitdaBasis','netIncomePerShare','enterpriseBridgeEvidence'] as const)
      if(field in m)Object.assign(source.financialMetrics!,{[field]:m[field]});
    const e=m?.enterpriseBridgeEvidence;
    if(e&&typeof e==='object')source.financialMetrics!.enterpriseBridgeEvidence={sourceType:e.sourceType,sourceUrl:e.sourceUrl,
      publishedDate:e.publishedDate,periodEnd:e.periodEnd,currency:e.currency,sharesOutstanding:e.sharesOutstanding,
      cashAndInvestments:e.cashAndInvestments,debtIncludingLeases:e.debtIncludingLeases,cashScope:e.cashScope,debtScope:e.debtScope};
  }
  return source;
}
export type TaiwanComparableIndex={sourceCount:number;evaluate:(ticker:string)=>ComparableMultiples|undefined};
/** Reusable native index; derived peer evidence exists only for the target in use. */
export function createTaiwanComparableIndex(stocks:Iterable<StockInput>):TaiwanComparableIndex {
  const groups=new Map<string,StockInput[]>();
  const businessGroups=new Map<string,StockInput[]>();
  const unique=new Map<string,StockInput>(),conflicts=new Set<string>();
  const bridgeSignature=(s:StockInput)=>{
    const e=s.financialMetrics?.enterpriseBridgeEvidence;
    return [e!==undefined,e?.sourceType,e?.sourceUrl,e?.publishedDate,e?.periodEnd,e?.currency,e?.sharesOutstanding,e?.cashAndInvestments,e?.debtIncludingLeases,e?.cashScope,e?.debtScope];
  };
  const signature=(s:StockInput)=>JSON.stringify([s.name,s.industry,s.market,s.updatedAt,s.financialDataDate,s.dataBasis,s.price,s.eps,s.bvps,s.roe,s.qualityAvailable,s.financialMetrics?.roeBasis,s.revenuePerShare,s.ebitdaPerShare,s.ebitPerShare,s.debtPerShare,s.cashPerShare,s.financialMetrics?.currency,s.financialMetrics?.sharesOutstanding,s.financialMetrics?.periodBasis,typeof s.financialMetrics?.shareBasis,s.financialMetrics?.shareBasis,typeof s.financialMetrics?.shareAsOfDate,s.financialMetrics?.shareAsOfDate,typeof s.financialMetrics?.shareSourceField,s.financialMetrics?.shareSourceField,s.financialMetrics?.nonControllingBookPerShare,s.financialMetrics?.ebitdaBasis,s.financialMetrics?.netIncomePerShare,bridgeSignature(s),s.taiwanBusinessGroup!==undefined,s.taiwanBusinessGroup?.id,s.taiwanBusinessGroup?.registryVersion]);
  for(const input of stocks) {
    const stock=compactTaiwanComparableSource(input);
    const previous=unique.get(stock.ticker);
    if(previous&&signature(previous)!==signature(stock))conflicts.add(stock.ticker);
    else unique.set(stock.ticker,stock);
  }
  const clean=[...unique.values()].filter(s=>!conflicts.has(s.ticker));
  const sources=new Map(clean.map(s=>[s.ticker,s]));
  const profiles=new Map<string,ReturnType<typeof taiwanApplicabilityProfile>>();
  const observed=new Map<string,Record<TaiwanComparableModelId,{numerator:number|undefined;denominator:number|undefined}>>();
  for(const stock of clean) {
    if(!dated(stock))continue;
    profiles.set(stock.ticker,taiwanApplicabilityProfile(stock));
    const divergence=taiwanEarningsOperationsDivergence(stock),bridge=taiwanEnterpriseAdjustment(stock),ev=bridge===null?undefined:stock.price+bridge;
    observed.set(stock.ticker,{pe:{numerator:stock.price,denominator:divergence?undefined:stock.eps},
      pb:{numerator:stock.price,denominator:stock.bvps},
      'p-sales':{numerator:stock.price,denominator:taiwanMaterialMinorityClaims(stock)?undefined:stock.revenuePerShare},
      'ev-revenue':{numerator:ev,denominator:stock.revenuePerShare},
      'ev-ebitda':{numerator:ev,denominator:stock.financialMetrics?.ebitdaBasis==='operating-income-plus-cashflow-da'&&!divergence?stock.ebitdaPerShare:undefined},
      'ev-ebit':{numerator:ev,denominator:divergence?undefined:stock.ebitPerShare}});
    // Do not remove classified members from another target's original industry pool.
    const key=industryKey(stock);
    if(key) {
      const group=key+'|'+stock.updatedAt;
      if(!groups.has(group))groups.set(group,[]);
      groups.get(group)!.push(stock);
    }
    if(validTaiwanBusinessGroupReference(stock)) {
      const group=stock.taiwanBusinessGroup!.id+'|'+stock.updatedAt;
      if(!businessGroups.has(group))businessGroups.set(group,[]);
      businessGroups.get(group)!.push(stock);
    }
  }
  for(const group of [...groups.values(),...businessGroups.values()])group.sort((a,b)=>a.ticker.localeCompare(b.ticker));
  const evaluate=(ticker:string):ComparableMultiples|undefined=>{
    const s=sources.get(ticker);
    if(!s||!profiles.has(ticker))return undefined;
    const business=s.taiwanBusinessGroup!==undefined;
    if(business&&!validTaiwanBusinessGroupReference(s))return undefined;
    const key=business?s.taiwanBusinessGroup!.id:industryKey(s);if(!key)return undefined;
    const target={...profiles.get(ticker)!};
    const peers=((business?businessGroups:groups).get(key+'|'+s.updatedAt)??[]).filter(p=>p.ticker!==s.ticker
      &&p.financialDataDate===s.financialDataDate&&p.financialMetrics?.shareBasis===s.financialMetrics?.shareBasis);
    const metric=(id:TaiwanComparableModelId) => {
      const observations=peers.map(p=>{
        const {numerator,denominator}=observed.get(p.ticker)![id];
        return {ticker:p.ticker,value:positive(numerator)&&positive(denominator)?numerator/denominator:undefined,numerator,denominator,profile:{...profiles.get(p.ticker)!}};
      }).filter((p):p is {ticker:string;value:number;numerator:number;denominator:number;profile:typeof target}=>positive(p.value)&&positive(p.numerator)&&positive(p.denominator)&&p.value<=MULTIPLE_CAPS[id]&&taiwanPeerApplicable(id,target,p.profile));
      const summary=summarizeTaiwanMultiple(id,target,observations);
      return {...summary,observations,tickers:observations.map(p=>p.ticker)};
    };
    const pe=metric('pe'),pb=metric('pb');
    // Sales multiples are strongly margin-dependent. Select comparable
    // observations instead of changing the observed multiple with a PE cap.
    // Factor 2 is a disclosed research assumption, not an external AI rule.
    const ps=metric('p-sales'),er=metric('ev-revenue'),ee=metric('ev-ebitda'),ei=metric('ev-ebit');
    const modelEvidence=Object.fromEntries([['pe',pe],['pb',pb],['p-sales',ps],['ev-revenue',er],['ev-ebitda',ee],['ev-ebit',ei]].map(([id,m])=>[id,{observations:(m as typeof pe).observations,issues:(m as typeof pe).issues}])) as NonNullable<ComparableMultiples['taiwanApplicabilityEvidence']>['models'];
    return {market:'TW',sector:s.industry!,peerGroup:key,peerCount:peers.length,
      peMedian:pe.value,pePeerCount:pe.count,pbMedian:pb.value,pbPeerCount:pb.count,
      psMedian:ps.value,psPeerCount:ps.count,evRevenueMedian:er.value,evRevenuePeerCount:er.count,
      evEbitdaMedian:ee.value,evEbitdaPeerCount:ee.count,evEbitMedian:ei.value,evEbitPeerCount:ei.count,
      pFfoMedian:null,pFfoPeerCount:0,dataBasis:'ltm',asOf:s.updatedAt!,quoteDate:s.updatedAt!,
      financialDateRange:[s.financialDataDate!,s.financialDataDate!],peerTickers:peers.map(p=>p.ticker),salesMarginRatioLimit:2,
      taiwanApplicabilityEvidence:{version:TAIWAN_APPLICABILITY_VERSION,profitabilityRatioLimit:2,target,models:modelEvidence},
      salesMarginEvidence:{targetNetMargin:incomeMargin(s,true),targetOperatingMargin:incomeMargin(s,false),psPeerTickers:ps.tickers,evRevenuePeerTickers:er.tickers},
      ...(business?{taiwanBusinessRegistryVersion:s.taiwanBusinessGroup!.registryVersion}:{}),
      method:business?'tw-business-group-same-session-median':'tw-industry-same-session-median'};
  };
  return {sourceCount:sources.size,evaluate};
}
/** Collector-compatible wrapper; finalize evaluates and discards one target at a time. */
export function buildTaiwanComparableMap(stocks:StockInput[]) {
  const index=createTaiwanComparableIndex(stocks),out=new Map<string,ComparableMultiples>();
  for(const stock of stocks) {
    if(out.has(stock.ticker))continue;
    const result=index.evaluate(stock.ticker);
    if(result)out.set(stock.ticker,result);
  }
  return out;
}
