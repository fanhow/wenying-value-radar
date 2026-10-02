import type {StockInput} from './valuation.ts';
import {isFinancialCompany} from './company-classification.ts';

export const TAIWAN_APPLICABILITY_VERSION='tw-applicability-2026-10-02-v2';
export const TAIWAN_COMPARABLE_MODEL_IDS=['pe','pb','p-sales','ev-revenue','ev-ebitda','ev-ebit'] as const;
export type TaiwanComparableModelId=typeof TAIWAN_COMPARABLE_MODEL_IDS[number];
/** Distinguish absent/inconsistent data from observed economics and peer fit. */
export type TaiwanApplicabilityIssueCategory='source-data'|'peer-comparability'|'assumption';
export type TaiwanApplicabilityIssue={code:string;reason:string;category:TaiwanApplicabilityIssueCategory};
export type TaiwanApplicabilityProfile={
  financialDate:string;
  shareBasis:string;
  financial:boolean;
  roeBasis:string;
  roe:number|null;
  netMargin:number|null;
  operatingMargin:number|null;
  minorityBookRatio:number|null;
};
export type TaiwanMultipleObservations={
  observations:Array<{ticker:string;value:number;numerator:number;denominator:number;profile:TaiwanApplicabilityProfile}>;
  issues:TaiwanApplicabilityIssue[];
};
export type TaiwanApplicabilityEvidence={
  version:typeof TAIWAN_APPLICABILITY_VERSION;
  profitabilityRatioLimit:2;
  target:TaiwanApplicabilityProfile;
  models:Record<TaiwanComparableModelId,TaiwanMultipleObservations>;
};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const positive=(v:unknown):v is number=>finite(v)&&v>0;
export function taiwanApplicabilityProfile(s:StockInput):TaiwanApplicabilityProfile {
  const m=s.financialMetrics;
  const margin=(income:number|undefined)=>finite(income)&&positive(s.revenuePerShare)?income/s.revenuePerShare:null;
  return {
    financialDate:s.financialDataDate??'',shareBasis:m?.shareBasis??'',financial:isFinancialCompany(s),
    roeBasis:m?.roeBasis??'',roe:s.qualityAvailable!==false&&finite(s.roe)?s.roe:null,
    netMargin:margin(m?.netIncomePerShare),operatingMargin:margin(s.ebitPerShare),
    minorityBookRatio:finite(m?.nonControllingBookPerShare)&&m.nonControllingBookPerShare>=0&&positive(s.bvps)
      ?m.nonControllingBookPerShare/s.bvps:null,
  };
}
const issue=(code:string,reason:string,category:TaiwanApplicabilityIssueCategory):TaiwanApplicabilityIssue=>({code,reason,category});
/** Applicability screens, not predictions, ROE buckets or fitted price discounts. */
export function taiwanTargetApplicabilityIssues(id:TaiwanComparableModelId,p:TaiwanApplicabilityProfile) {
  const issues:TaiwanApplicabilityIssue[]=[];
  // ROE directly relates to book multiples. For P/E it affects growth and
  // reinvestment indirectly; missing opening equity does not invalidate EPS.
  if(id==='pb'&&(!positive(p.roe)||p.roeBasis!=='parent-income-average-equity')) {
    const sourceGap=!finite(p.roe)||p.roeBasis!=='parent-income-average-equity';
    issues.push(issue('PROFITABILITY_BASIS_UNAVAILABLE',sourceGap
      ?'缺少正數、歸母淨利／平均權益口徑的 LTM ROE；不以 EPS／期末淨值或不同 ROE 口徑替代。'
      :'已知歸母平均權益 ROE 不是正數；傳統獲利倍數的正獲利前提不成立，屬模型適用限制，非資料來源缺漏。',sourceGap?'source-data':'assumption'));
  }
  if(!p.financial&&!positive(p.operatingMargin)) {
    const sourceGap=!finite(p.operatingMargin);
    issues.push(issue('OPERATING_PROFITABILITY_UNAVAILABLE',sourceGap
      ?'缺少同財報期間的營業利益率，無法確認倍數適用性。'
      :'已知營業利益率不是正數；傳統營運倍數的正本業獲利前提不成立，屬模型適用限制，非資料來源缺漏。',sourceGap?'source-data':'assumption'));
  }
  if((id==='pe'&&!p.financial)||id==='p-sales') {
    if(!positive(p.netMargin)) {
      const sourceGap=!finite(p.netMargin);
      issues.push(issue('PARENT_PROFITABILITY_UNAVAILABLE',sourceGap
        ?'缺少歸母淨利率，不能確認不同獲利能力的同業倍數是否適用。'
        :'已知歸母淨利率不是正數；傳統獲利倍數的正盈餘前提不成立，屬模型適用限制，非資料來源缺漏。',sourceGap?'source-data':'assumption'));
    }
  }
  if(id==='p-sales'&&(!finite(p.minorityBookRatio)||p.minorityBookRatio<0||p.minorityBookRatio>.25)) {
    const sourceGap=!finite(p.minorityBookRatio)||p.minorityBookRatio<0;
    issues.push(issue('MINORITY_SCOPE_UNVERIFIED',sourceGap
      ?'非控制權益未知或帳面比例無效；合併營收不能直接視為全屬普通股股東。'
      :'已知非控制權益超過歸母帳面權益 25%；直接套用合併營收 P/S 的歸屬假設尚不適用，待拆分股東損益，非資料來源缺漏。',sourceGap?'source-data':'assumption'));
  }
  return issues;
}
const similar=(a:number|null,b:number|null)=>positive(a)&&positive(b)&&b/a>=.5&&b/a<=2;
export function taiwanPeerApplicable(id:TaiwanComparableModelId,target:TaiwanApplicabilityProfile,peer:TaiwanApplicabilityProfile) {
  if(target.financialDate!==peer.financialDate||target.shareBasis!==peer.shareBasis||target.financial!==peer.financial
    ||taiwanTargetApplicabilityIssues(id,target).length||taiwanTargetApplicabilityIssues(id,peer).length)return false;
  if(id==='pb'&&!similar(target.roe,peer.roe))return false;
  if((id==='pe'&&!target.financial)||id==='p-sales') {
    if(!similar(target.netMargin,peer.netMargin)||!similar(target.operatingMargin,peer.operatingMargin))return false;
  }
  if(id==='ev-revenue'&&!similar(target.operatingMargin,peer.operatingMargin))return false;
  return true;
}
export function summarizeTaiwanMultiple(id:TaiwanComparableModelId,target:TaiwanApplicabilityProfile,observations:TaiwanMultipleObservations['observations']) {
  const issues=taiwanTargetApplicabilityIssues(id,target);
  const present=Array.from(observations).filter(o=>o&&positive(o.value));
  const sorted=present.map(o=>o.value).sort((a,b)=>a-b),n=sorted.length;
  if(present.length!==observations.length)issues.push(issue('INVALID_PEER_OBSERVATION','同業觀察含空白或無效倍數；不把陣列長度當成有效樣本數。','source-data'));
  if(n<5)issues.push(issue('INSUFFICIENT_MATCHED_PEERS','同報價日、同財報截止日與股數口徑，並通過獲利能力適用性檢查的同業少於 5 家；不回退未匹配的廣產業樣本。','peer-comparability'));
  else if(sorted[Math.ceil((n-1)*.75)]/sorted[Math.floor((n-1)*.25)]>4)
    issues.push(issue('PEER_MULTIPLE_DISPERSION','同業倍數中間 50% 的高低比超過 4；不製造精準產業倍數。','peer-comparability'));
  const lower=sorted[Math.floor((n-1)/2)],upper=sorted[Math.floor(n/2)];
  const value=issues.length?null:lower+(upper-lower)/2;
  return {value,count:n,issues};
}
