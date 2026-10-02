import {withTaiwanBusinessGroup,TAIWAN_BUSINESS_REGISTRY_VERSION} from '../../lib/taiwan-business-groups.ts';

// Deterministic synthetic native sources; no external value or selected target.
export function comparableIndexInputs() {
  const make=(ticker,patch={})=>({ticker,name:'Synthetic issuer',market:'TW',sector:'Technology',industry:'Synthetic devices',
    price:100,eps:10,bvps:40,fcfPerShare:8,targetPe:15,targetPb:2,targetFcfMultiple:15,revenueGrowth:10,roe:25,debtRatio:30,
    uncertainty:.3,dataBasis:'ltm',updatedAt:'2026-10-01',financialDataDate:'2026-06-30',revenuePerShare:100,
    ebitPerShare:12,ebitdaPerShare:15,cashPerShare:5,debtPerShare:10,
    financialMetrics:{currency:'TWD',periodBasis:'ltm',shareBasis:'period-end-ordinary',roeBasis:'parent-income-average-equity',
      growthBasis:'ttm-yoy',sharesOutstanding:100000000,netIncomePerShare:10,nonControllingBookPerShare:0,
      ebitdaBasis:'operating-income-plus-cashflow-da',enterpriseBridgeEvidence:{sourceType:'issuer-filing',
        sourceUrl:'https://example.test/synthetic-filing',publishedDate:'2026-08-15',periodEnd:'2026-06-30',currency:'TWD',
        sharesOutstanding:100000000,cashAndInvestments:500000000,debtIncludingLeases:1000000000,
        cashScope:'unrestricted-cash-and-short-term-investments-excluding-factoring',debtScope:'interest-bearing-with-current-and-noncurrent-leases'}},...patch});
  const rows=Array.from({length:12},(_,i)=>make(String(7000+i),{price:80+i*4}));
  rows[4].qualityAvailable=false;
  rows.push(...Array.from({length:6},(_,i)=>make(String(7100+i),{name:'Synthetic 銀行',sector:'Financials',industry:'金融業'})));
  rows.push(...Array.from({length:6},(_,i)=>make(String(7200+i),{name:'Synthetic 證券',sector:'Financials',industry:'金融業'})));
  rows.push(...Array.from({length:6},(_,i)=>make(String(7300+i),{updatedAt:'2026-09-30'})));
  rows.push(...Array.from({length:6},(_,i)=>make(String(7400+i),{financialDataDate:'2026-05-31'})));
  rows.push(...['2451','3135','3260','4967','4973','8088','8271'].map(ticker=>withTaiwanBusinessGroup(make(ticker))));
  rows.push(make('7500',{taiwanBusinessGroup:{id:'tw-memory-module-storage-products',registryVersion:TAIWAN_BUSINESS_REGISTRY_VERSION}}));
  rows.push(make('7501',{taiwanBusinessGroup:{id:'tw-memory-module-storage-products',registryVersion:'invalid-version'}}));
  rows.push(make('7502',{taiwanBusinessGroup:{id:'unknown-business',registryVersion:TAIWAN_BUSINESS_REGISTRY_VERSION}}));
  rows.push(make('7503',{financialDataDate:'2020-01-01'}));
  rows.push(make('7504',{dataBasis:'annual'}));
  rows.push(make('7505',{industry:'未分類'}));
  rows.push(make('7506',{roe:0}));
  rows.push(make('7507',{ebitPerShare:-1}));
  const minority=make('7508');minority.financialMetrics.nonControllingBookPerShare=20;rows.push(minority);
  const provider=make('7509');Object.assign(provider.financialMetrics,{shareBasis:'provider-as-of-ordinary',
    shareAsOfDate:'2026-06-30',shareSourceField:'quarterlyOrdinarySharesNumber'});rows.push(provider);
  const invalidShares=make('7510');Object.assign(invalidShares.financialMetrics,{shareBasis:'provider-as-of-ordinary',
    shareAsOfDate:'2000-01-01',shareSourceField:'quarterlyOrdinarySharesNumber'});rows.push(invalidShares);
  rows.push(structuredClone(rows[0])); // Exact duplicates collapse.
  rows.push({...rows[1],fcfPerShare:999}); // Unused fields do not create conflicts.
  rows.push({...rows[2],eps:11}); // Native signature conflict removes all copies.
  // Existing signature omits sector: preserve its last-representative behavior.
  rows.push({...rows[3],sector:'Financials'});
  return rows;
}
