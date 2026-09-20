import { valuationTargets, calculateStock, type StockInput } from './valuation.ts';
import { parseYahooDailyCandles, type YahooChartPayload } from './price-history.ts';
import { aggregateCandles, analyzeTechnicalSetup } from './technical-analysis.ts';
import { calibrateFairValue } from './valuation-calibration.ts';
import { officialSession } from './refresh-calendar.ts';

export type RefreshTarget = { ticker: string; name: string; market: 'TW' | 'US'; sector: string; listingBoard?: 'TWSE' | 'TPEx'; industry?: string };
export type RefreshRecord = {
  ticker: string; market: 'TW' | 'US'; status: 'ready' | 'unavailable'; issues: string[];
  fetchedAt: string; quoteDate?: string; financialDate?: string;
  stock?: StockInput; history?: ReturnType<typeof historyResult>;
  sources: string[];
  rankingEligible?: boolean;
};
type Point = { asOfDate?: string; periodType?: string; currencyCode?: string; reportedValue?: { raw?: number } };
type SeriesPayload = { timeseries?: { error?: unknown; result?: Array<{ meta?: { type?: string[] }; [key: string]: unknown }> } };
const SERIES = ['DilutedEPS','TotalRevenue','OperatingCashFlow','CapitalExpenditure','TotalAssets',
  'TotalLiabilitiesNetMinorityInterest','StockholdersEquity','OrdinarySharesNumber','NetIncome',
  'OperatingIncome','EBITDA','CashCashEquivalentsAndShortTermInvestments','TotalDebt','TaxProvision','PretaxIncome'];
const DAY = 86400000;

export function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ms = Date.parse(v + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10) === v ? v : null;
}
export function completedCandles(payload: YahooChartPayload, market: 'TW' | 'US', now = new Date(), sessionCeiling?: string) {
  const zone = market === 'TW' ? 'Asia/Taipei' : 'America/New_York';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(now).map(p=>[p.type,p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour)*60 + Number(parts.minute);
  const afterClose = minutes >= (market === 'TW' ? 13*60+30 : 16*60);
  return parseYahooDailyCandles(payload, 400).filter(c => (!sessionCeiling || c.date <= sessionCeiling) && (c.date < date || (c.date === date && afterClose)));
}
export function quarterlyInputs(payload: SeriesPayload, currency: string, now = new Date()) {
  const values = new Map<string, Map<string, number>>();
  for (const item of payload.timeseries?.result ?? []) {
    const type = item.meta?.type?.[0] ?? '';
    if (!Array.isArray(item[type])) continue;
    const map = new Map<string, number>();
    for (const p of item[type] as Point[]) {
      if (!isoDate(p.asOfDate) || p.periodType !== (type.startsWith('trailing')?'TTM':'3M') || p.currencyCode !== currency || !Number.isFinite(p.reportedValue?.raw)) continue;
      map.set(p.asOfDate!, p.reportedValue!.raw!);
    }
    values.set(type, map);
  }
  // A newly posted TTM flow must not be combined with an older balance sheet.
  // Anchor all flows and balances to the latest reported quarterly revenue date.
  const revenueDates = [...(values.get('quarterlyTotalRevenue')?.keys() ?? [])].sort();
  if (!revenueDates.length) throw new Error('FOUR_QUARTERS_OR_ALIGNED_TTM_UNAVAILABLE');
  const end = revenueDates.at(-1)!, age = (now.getTime()-Date.parse(end))/DAY;
  if (age < 0 || age > 180) throw new Error('FINANCIAL_PERIOD_STALE_OR_FUTURE');
  const dates = [...(values.get('quarterlyTotalRevenue')?.keys() ?? [])].filter(d=>d<=end).sort().slice(-4);
  const contiguous = dates.length===4 && dates.at(-1)===end && dates.slice(1).every((d,i)=>{
    const gap=(Date.parse(d)-Date.parse(dates[i]))/DAY;
    return gap>=70 && gap<=110;
  });
  const last = (key: string) => values.get('quarterly'+key)?.get(end);
  const sum = (key: string) => {
    const direct = values.get('trailing'+key)?.get(end);
    if (direct !== undefined) return direct;
    // A provider TTM observation is already a twelve-month flow. Missing Q3
    // must not reject it, but may never be filled with an older quarter.
    if (!contiguous) return undefined;
    const v = dates.map(d=>values.get('quarterly'+key)?.get(d));
    return v.every(x=>Number.isFinite(x)) ? (v as number[]).reduce((a,b)=>a+b,0) : undefined;
  };
  const shares=last('OrdinarySharesNumber'), equity=last('StockholdersEquity'), assets=last('TotalAssets'), liabilities=last('TotalLiabilitiesNetMinorityInterest');
  const revenue=sum('TotalRevenue'), ocf=sum('OperatingCashFlow'), capex=sum('CapitalExpenditure');
  if (!shares || shares <= 0 || equity === undefined || !assets || liabilities === undefined || revenue === undefined || ocf === undefined || capex === undefined) throw new Error('CORE_FINANCIAL_FIELDS_MISSING');
  const previous = (key:string) => [...(values.get(key)?.entries()??[])].find(([d])=>Math.abs((Date.parse(end)-Date.parse(d))/DAY-365)<10)?.[1];
  const previousDates=[...(values.get('quarterlyTotalRevenue')?.keys()??[])].filter(d=>d<=end).sort();
  const priorEnd=previousDates.find(d=>Math.abs((Date.parse(end)-Date.parse(d))/DAY-365)<10);
  const priorDates=priorEnd?previousDates.filter(d=>d<=priorEnd).slice(-4):[];
  const priorContiguous=priorDates.length===4&&priorDates.slice(1).every((d,i)=>{
    const gap=(Date.parse(d)-Date.parse(priorDates[i]))/DAY; return gap>=70&&gap<=110;
  });
  const priorTtm = previous('trailingTotalRevenue') ?? (priorContiguous?priorDates.reduce((n,d)=>n+values.get('quarterlyTotalRevenue')!.get(d)!,0):undefined);
  const priorQuarter = previous('quarterlyTotalRevenue');
  const growthBasis = priorTtm && priorTtm>0 ? 'TTM YoY' : 'latest quarter YoY';
  const revenueGrowth = priorTtm && priorTtm>0 ? (revenue/priorTtm-1)*100 : priorQuarter && priorQuarter>0 ? (last('TotalRevenue')!/priorQuarter-1)*100 : undefined;
  const annualEps=sum('DilutedEPS'), bvps=equity/shares;
  if (annualEps===undefined || revenueGrowth===undefined || equity<=0) throw new Error('EPS_GROWTH_OR_POSITIVE_EQUITY_UNAVAILABLE');
  const roe=annualEps/bvps*100, debtRatio=liabilities/assets*100;
  const result: Partial<StockInput> = { eps:annualEps, bvps, fcfPerShare:(ocf-Math.abs(capex))/shares,
    revenueGrowth, roe, debtRatio, revenuePerShare:revenue/shares, financialDataDate:end,
    dataBasis:'ltm', dataCompleteness:'historical', qualityAvailable:true,
    ...valuationTargets(revenueGrowth,roe,debtRatio), sourceNote:`Yahoo Finance TTM（同截止日供應商 TTM；僅在四季連續時加總補足）；營收成長：${growthBasis}` };
  const optional: Array<[keyof StockInput, number | undefined]> = [
    ['ebitPerShare',sum('OperatingIncome')],['ebitdaPerShare',sum('EBITDA')],['cashPerShare',last('CashCashEquivalentsAndShortTermInvestments')],['debtPerShare',last('TotalDebt')],
  ];
  for (const [key,value] of optional) if (value !== undefined) Object.assign(result,{[key]:value/shares});
  const net=sum('NetIncome'); if(net!==undefined&&revenue>0) result.netMargin=net/revenue*100;
  result.assetTurnover=revenue/assets; if(equity!==0) result.financialLeverage=assets/equity;
  return result;
}

async function json(url: string, fetcher: typeof fetch) {
  const r=await fetcher(url,{headers:{Accept:'application/json','User-Agent':'Mozilla/5.0 (WenYingDailyRefresh)'},signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!r.ok) throw new Error(`UPSTREAM_HTTP_${r.status}`);
  return r.json();
}
function historyResult(ticker: string, market: 'TW'|'US', symbol: string, candles: ReturnType<typeof completedCandles>, upside: number) {
  return {ticker,market,symbol,tradingViewSymbol:market==='TW'?`${symbol.endsWith('.TWO')?'TPEX':'TWSE'}:${ticker}`:ticker,
    candles:candles.slice(-120),weeklyCandles:aggregateCandles(candles,'week').slice(-52),monthlyCandles:aggregateCandles(candles,'month').slice(-12),
    technicalAnalysis:analyzeTechnicalSetup(candles,upside)};
}
export async function fetchRefreshRecord(target: RefreshTarget, expectedDate: string, now = new Date(), fetcher: typeof fetch = fetch): Promise<RefreshRecord> {
  const record: RefreshRecord={ticker:target.ticker,market:target.market,status:'unavailable',issues:[],sources:[],fetchedAt:now.toISOString()};
  const symbol=target.market==='TW'?`${target.ticker}.${target.listingBoard==='TPEx'?'TWO':'TW'}`:target.ticker;
  const chartUrl=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&events=div%2Csplits`;
  const financialUrl=`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${[...SERIES.map(s=>'quarterly'+s),...['DilutedEPS','TotalRevenue','OperatingCashFlow','CapitalExpenditure','OperatingIncome','EBITDA','NetIncome'].map(s=>'trailing'+s)].join(',')}&period1=${Math.floor(now.getTime()/1000)-DAY/1000*1000}&period2=${Math.floor(now.getTime()/1000)}`;
  record.sources=[chartUrl,financialUrl];
  try {
    const [chart, financial] = await Promise.all([json(chartUrl,fetcher),json(financialUrl,fetcher)]);
    const currency=chart?.chart?.result?.[0]?.meta?.currency;
    if(currency!==(target.market==='TW'?'TWD':'USD')) throw new Error('QUOTE_CURRENCY_UNSUPPORTED');
    const candles=completedCandles(chart,target.market,now,expectedDate), latest=candles.at(-1);
    record.quoteDate=latest?.date;
    if(candles.length<60 || !latest || latest.date!==expectedDate) throw new Error('QUOTE_NOT_LATEST_COMPLETED_SESSION');
    const inputs=quarterlyInputs(financial,currency,now);
    record.financialDate=inputs.financialDataDate;
    const stock: StockInput={...target,price:latest.close,eps:0,bvps:0,fcfPerShare:0,revenueGrowth:0,roe:0,debtRatio:0,
      targetPe:0,targetPb:0,targetFcfMultiple:0,uncertainty:0.30,...inputs,updatedAt:latest.date,source:'自動資料',priceSource:'Yahoo Finance daily close / daily-refresh-v1',
      sourceNote:`每日雲端更新；${inputs.sourceNote}，截至 ${inputs.financialDataDate}；股價 ${latest.date}；擷取 ${now.toISOString()}。公開資料供應商，尚未逐檔與公司原始申報核對；非分析師即時目標價。`};
    const value=calculateStock(stock), upside=calibrateFairValue(value).calibratedUpside;
    record.stock=stock; record.history=historyResult(target.ticker,target.market,symbol,candles,upside); record.status='ready';
    const shares = (financial.timeseries?.result??[]).find((r: {meta?:{type?:string[]}})=>r.meta?.type?.[0]==='quarterlyOrdinarySharesNumber')?.quarterlyOrdinarySharesNumber?.find((p:Point)=>p.asOfDate===inputs.financialDataDate)?.reportedValue?.raw;
    record.rankingEligible=target.market==='TW'?latest.volume>=100000&&latest.close*latest.volume>=5000000:latest.close>=3&&latest.volume>=100000&&Number(shares)*latest.close>=500000000;
  } catch(error) { record.issues=[error instanceof Error?error.message:'UPSTREAM_UNAVAILABLE']; }
  return record;
}
export async function expectedSession(market:'TW'|'US',now=new Date(),fetcher:typeof fetch=fetch) {
  const symbol=market==='TW'?'0050.TW':'SPY';
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
  const [p,calendar]=await Promise.all([json(url,fetcher),officialSession(market,now,fetcher)]), candles=completedCandles(p,market,now,calendar.date), date=candles.at(-1)?.date;
  if(!date || (now.getTime()-Date.parse(date))/DAY>14) throw new Error('SESSION_REFERENCE_UNAVAILABLE');
  if(date!==calendar.date)throw new Error('REFERENCE_DISAGREES_WITH_EXCHANGE_CALENDAR');
  return {date,source:url,calendarSource:calendar.source,basis:'official exchange holiday calendar checked against completed benchmark OHLC; mismatch fails closed'};
}
