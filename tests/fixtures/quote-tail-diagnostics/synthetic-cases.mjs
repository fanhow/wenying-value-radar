// Portable synthetic provider fixtures; no retrieved prices or private financial data.
export const expected='2026-10-12';
export const refreshTime=new Date('2026-10-13T03:06:40Z');
function datesTo(end, count = 80, market = 'US') {
  const dates = [];
  for (let time = Date.parse(`${end}T00:00:00Z`); dates.length < count; time -= 86400000) {
    const day = new Date(time);
    const date = day.toISOString().slice(0, 10);
    // Include the October Taiwan closure relevant to this diagnostic scenario.
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6 && !(market === 'TW' && date === '2026-10-09')) dates.unshift(date);
  }
  return dates;
}
export function chartFixture(target, end = expected, count = 80) {
  const dates = datesTo(end, count, target.market);
  const symbol = target.market === 'TW' ? `${target.ticker}.${target.listingBoard === 'TPEx' ? 'TWO' : 'TW'}` : target.ticker;
  return { chart: { result: [{
    meta: { symbol, currency: target.market === 'TW' ? 'TWD' : 'USD' },
    timestamp: dates.map(date => Date.parse(`${date}T${target.market === 'TW' ? '01:00' : '13:30'}:00Z`) / 1000),
    indicators: { quote: [{
      open: dates.map((_, i) => 100 + i), high: dates.map((_, i) => 102 + i),
      low: dates.map((_, i) => 99 + i), close: dates.map((_, i) => 101 + i),
      volume: dates.map(() => 1000000),
    }] },
  }] } };
}
export function financialFixture(target) {
  const currency = target.market === 'TW' ? 'TWD' : 'USD';
  const series = (type, value, date = '2026-06-30') => ({ meta: { type: [type] }, [type]: [{
    asOfDate: date, periodType: type.startsWith('trailing') ? 'TTM' : '3M', currencyCode: currency,
    reportedValue: { raw: value },
  }] });
  return { timeseries: { result: [
    series('quarterlyTotalRevenue', 100),
    ...Object.entries({ TotalRevenue: 400, DilutedEPS: 4, NetIncome: 40, OperatingCashFlow: 80, CapitalExpenditure: -20 }).map(([key, value]) => series(`trailing${key}`, value)),
    ...Object.entries({ OrdinarySharesNumber: 10, StockholdersEquity: 200, TotalAssets: 400, TotalLiabilitiesNetMinorityInterest: 200 }).map(([key, value]) => series(`quarterly${key}`, value)),
    series('trailingTotalRevenue', 200, '2025-06-30'),
  ] } };
}

export const caseNames=['ready','null-close','missing-close-index','undefined-close','short-column','string-close','nan-close','infinity-close','high-below-low','outside-envelope','duplicate-date','decreasing-date','invalid-timestamp','short-history','missing-quote','wrong-column-shape','financial-http','chart-http'];
export function fixtureCase(name,index) {
  const target={ticker:`D${String(index).padStart(2,'0')}`,name:'Synthetic diagnostic fixture',sector:'Other',market:'US'};
  const chart=chartFixture(target,expected,name==='short-history'?59:80),r=chart.chart.result[0],q=r.indicators.quote[0],last=r.timestamp.length-1;
  if(name==='null-close')q.close[last]=null;
  if(name==='missing-close-index')delete q.close[last];
  if(name==='undefined-close')q.close[last]=undefined;
  if(name==='short-column')q.close.pop();
  if(name==='string-close')q.close[last]='PRIVATE_STRING_MUST_NOT_BE_LOGGED';
  if(name==='nan-close')q.close[last]=NaN;
  if(name==='infinity-close')q.close[last]=Infinity;
  if(name==='high-below-low')q.high[last]=q.low[last]-1;
  if(name==='outside-envelope')q.open[last]=q.high[last]+1;
  if(name==='duplicate-date')r.timestamp[last]=r.timestamp[last-1];
  if(name==='decreasing-date')r.timestamp[last]=r.timestamp[last-2];
  if(name==='invalid-timestamp')r.timestamp[last]=NaN;
  if(name==='missing-quote')r.indicators.quote=[];
  if(name==='wrong-column-shape')q.close={};
  const fetcher=async url=>{const isChart=String(url).includes('/chart/');const status=name==='chart-http'&&isChart||name==='financial-http'&&!isChart?503:200;
    return {ok:status===200,status,json:async()=>isChart?chart:financialFixture(target)};};
  return {target,chart,fetcher};
}
