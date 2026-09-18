export const NYSE_CALENDAR='https://www.nyse.com/trade/hours-calendars';
export function parseNyseHolidays(html:string,year:number) {
  const table=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g)].map(m=>m[0]).find(s=>s.includes('Holiday')&&s.includes('Good Friday'));
  if(!table)throw new Error('NYSE_CALENDAR_UNAVAILABLE');
  const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c=>c[1].replace(/<[^>]*>/g,'')));
  const column=rows[0].indexOf(String(year));if(column<1)throw new Error('NYSE_CALENDAR_YEAR_UNAVAILABLE');
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const holidays=rows.slice(1).flatMap(row=>{
    const m=row[column]?.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/);
    return m?[`${year}-${String(months.indexOf(m[1])+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`]:[];
  });
  if(holidays.length<9)throw new Error('NYSE_CALENDAR_INCOMPLETE');return holidays;
}
export function parseTwseHolidays(p:{stat?:string;queryYear?:number;data?:string[][]},year:number) {
  if(p.stat!=='ok'||p.queryYear!==year||!p.data||p.data.length<10)throw new Error('TWSE_CALENDAR_UNAVAILABLE');
  return p.data.filter(r=>/放假|補假|無交易/.test(r[1]+' '+r[2])).map(r=>r[0]);
}
export function latestCalendarSession(market:'TW'|'US',now:Date,holidays:string[]) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:market==='TW'?'Asia/Taipei':'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const day=new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  if(Number(parts.hour)*60+Number(parts.minute)<(market==='TW'?810:960))day.setUTCDate(day.getUTCDate()-1);
  for(let i=0;i<20;i++) {
    const date=day.toISOString().slice(0,10);
    if(day.getUTCDay()!==0&&day.getUTCDay()!==6&&!holidays.includes(date))return date;
    day.setUTCDate(day.getUTCDate()-1);
  }throw new Error('NO_RECENT_MARKET_SESSION');
}
export async function officialSession(market:'TW'|'US',now:Date,fetcher:typeof fetch=fetch) {
  const year=Number(new Intl.DateTimeFormat('en-CA',{timeZone:market==='TW'?'Asia/Taipei':'America/New_York',year:'numeric'}).format(now));
  const source=market==='TW'?`https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=json&queryYear=${year}`:NYSE_CALENDAR;
  const r=await fetcher(source,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('EXCHANGE_CALENDAR_FETCH_FAILED');
  const payload=market==='TW'?await r.json():await r.text();
  let holidays=market==='TW'?parseTwseHolidays(payload,year):parseNyseHolidays(payload,year);
  let date=latestCalendarSession(market,now,holidays);
  if(!date.startsWith(String(year))) {
    const previous=market==='TW'?await(await fetcher(source.replace(String(year),String(year-1)),{signal:AbortSignal.timeout(20000)})).json():payload;
    holidays=holidays.concat(market==='TW'?parseTwseHolidays(previous,year-1):parseNyseHolidays(previous,year-1));
    date=latestCalendarSession(market,now,holidays);
  }
  return {date,source};
}
