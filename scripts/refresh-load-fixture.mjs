import {createHash} from 'node:crypto';

/** Synthetic local load shapes, never a market sample or price benchmark. */
export const LOAD_LEVELS = Object.freeze([
  Object.freeze({id:'dense185',twCount:185,groupSize:185,usCount:8}),
  Object.freeze({id:'groups740',twCount:740,groupSize:185,usCount:8}),
  Object.freeze({id:'usefulReady6165',twCount:1850,groupSize:185,usCount:4315}),
]);

export const REFRESH_LOAD_FIXTURE_VERSION = 'synthetic-refresh-load-v2';
export const REFRESH_LOAD_FIXTURE_SEED = 20261002;
const DEFAULT_VALUATION_VERSION = 'tw-comparables-2026-10-02-research-v3';
const DAY = 86400000;
const QUOTE_SOURCE = 'Yahoo Finance daily close / daily-refresh-v1';

function validDate(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}

function neutralTechnicalAnalysis(price,date) {
  // Flat bars have no strategy signals. This stable complete shape avoids
  // importing the revision under test when constructing its raw fixture.
  return {asOf:date,close:price,ma5:price,ma20:price,ma60:price,ema15:price,sma50:price,
    dailyTrend:'neutral',movingAverageSignal:'mixed',goldenCrossDaysAgo:null,
    wBottom:'none',wBottomLow:null,wBottomNeckline:null,trendPullback:null,
    stage2Breakout:null,valueTrendResonance:null,weeklyRangePosition:null,
    monthlyRangePosition:null,volumeRatio20:1,atr14:2,supportLevel:null,
    supportTimeframe:null,supportDistance:null,resistanceLevel:null,
    resistanceTimeframe:null,resistanceDistance:null,keyLevels:[],nearSupport:false,
    nearResistance:false,patternAtSupport:false,patternAtResistance:false,
    supportBroken:false,candlestickPattern:'none',patternDirection:'neutral',
    patternStage:'none',consecutiveLargeBearish:0,consecutiveLargeBullish:0,
    consecutiveTrendCandles:0,ma20Deviation:0,gapDirection:null,technicalAlert:'neutral'};
}

function deterministicPrice(index,seed) {
  // Narrow price dispersion keeps all 184 observations usable. The last
  // Taiwan identity is deliberately cheaper than every other identity.
  const mixed=Math.imul((index+1)^(seed>>>0),2654435761)>>>0;
  return (9500+mixed%1001)/100;
}

/**
 * Build raw collector inputs, not expanded comparable evidence. All flows
 * use the same LTM cutoff and 100m ordinary shares; EPS equals parent income
 * per share, ROE equals 10/40, and no vendor EV bridge is invented.
 * The quoteSource enum is required by the ingestion contract; sources,
 * sourceNote and meta explicitly identify these observations as synthetic.
 */
export function buildRefreshLoadFixture(level,options={}) {
  const selected=typeof level==='string'?LOAD_LEVELS.find(item=>item.id===level):level;
  if(!selected||!LOAD_LEVELS.some(item=>item.id===selected.id && item.twCount===selected.twCount
    && item.groupSize===selected.groupSize && item.usCount===selected.usCount)) {
    throw new Error('UNKNOWN_REFRESH_LOAD_LEVEL');
  }
  const {seed=REFRESH_LOAD_FIXTURE_SEED,date='2026-10-01',financialDate='2026-06-30',
    valuationVersion=DEFAULT_VALUATION_VERSION,runId=`load_fixture_${selected.id}`}=options;
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new Error('INVALID_FIXTURE_SEED');
  if(!validDate(date)||!validDate(financialDate)||financialDate>date
    ||Date.parse(date)-Date.parse(financialDate)>180*DAY)throw new Error('INVALID_FIXTURE_DATES');
  if(typeof valuationVersion!=='string'||!valuationVersion.trim())throw new Error('INVALID_FIXTURE_VALUATION_VERSION');
  if(typeof runId!=='string'||!/^[a-zA-Z0-9_-]{8,90}$/.test(runId))throw new Error('INVALID_FIXTURE_RUN_ID');
  const candleDates=Array.from({length:80},(_,index)=>new Date(Date.parse(date)-(79-index)*DAY).toISOString().slice(0,10));
  const baseTicker=selected.id==='dense185'?7000:1000;
  const records=[];
  for(const market of ['TW','US']) {
    const count=market==='TW'?selected.twCount:selected.usCount;
    for(let index=0;index<count;index++) {
      const ticker=market==='TW'?String(baseTicker+index):index<8?`SYNTHUS${String.fromCharCode(65+index)}`:`SYNUS${index.toString(36).toUpperCase().padStart(4,'0')}`;
      const industry=market==='TW'?`Synthetic load cohort group${String(Math.floor(index/selected.groupSize)).padStart(3,'0')}`:'Synthetic US load controls';
      const price=market==='TW'&&index===count-1?60:deterministicPrice(index,seed);
      const stock={ticker,name:`Synthetic load issuer ${ticker}`,market,sector:'Industrials',industry,
        ...(market==='TW'?{listingBoard:'TWSE'}:{}),price,eps:10,bvps:40,fcfPerShare:9,
        revenueGrowth:10,roe:25,debtRatio:30,targetPe:15,targetPb:2,targetFcfMultiple:15,
        uncertainty:.3,dataBasis:'ltm',dataCompleteness:'complete',qualityAvailable:true,
        financialDataDate:financialDate,updatedAt:date,priceSource:QUOTE_SOURCE,source:'自動資料',
        sourceNote:'SYNTHETIC LOCAL PERFORMANCE FIXTURE: generated observations, no real issuer or market-price evidence.',
        revenuePerShare:100,ebitPerShare:12,netMargin:10,netMarginUnit:'percent',
        financialMetrics:{currency:market==='TW'?'TWD':'USD',periodBasis:'ltm',sharesOutstanding:100000000,
          shareBasis:'provider-as-of-ordinary',shareAsOfDate:financialDate,
          shareSourceField:'quarterlyOrdinarySharesNumber',roeBasis:'parent-income-average-equity',
          growthBasis:'ttm-yoy',revenueGrowthTtmYoY:10,netIncomePerShare:10,
          nonControllingBookPerShare:0},
        ...(market==='TW'?{valuationPolicy:'tw-comparables-v1',dailyValuationVersion:valuationVersion,dailyRunId:runId}:{})};
      const candles=candleDates.map(candleDate=>({date:candleDate,open:price,high:price+1,
        low:price-1,close:price,volume:1000000}));
      records.push({ticker,market,status:'ready',issues:[],stock,rankingEligible:true,
        fetchedAt:`${date}T16:00:00.000Z`,quoteDate:date,financialDate,
        sources:['synthetic://refresh-load-fixture/generated'],
        history:{ticker,market,name:stock.name,symbol:market==='TW'?`${ticker}.TW`:ticker,
          quoteSource:QUOTE_SOURCE,candles,weeklyCandles:[],monthlyCandles:[],
          technicalAnalysis:neutralTechnicalAnalysis(price,date)}});
    }
  }
  const manifest={valuationVersion,expectedSessions:{TW:date,US:date},
    targets:records.map(({ticker,market})=>({ticker,market})),
    universeSource:['Synthetic local performance fixture; no real market universe']};
  return {records,manifest,meta:{version:REFRESH_LOAD_FIXTURE_VERSION,synthetic:true,level:selected.id,
    seed,runId,quoteDate:date,financialDate,twCount:selected.twCount,usCount:selected.usCount,
    groupSize:selected.groupSize,twGroupCount:Math.ceil(selected.twCount/selected.groupSize),
    historyBars:80,highestNativeGapTicker:String(baseTicker+selected.twCount-1)}};
}

/** Hash the exact raw inputs supplied to a revision before it prepares peers. */
export function refreshLoadFixtureFingerprint(fixture) {
  return createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
}
