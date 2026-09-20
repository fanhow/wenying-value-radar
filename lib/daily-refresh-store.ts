import './runtime-env.ts';
import { DAILY_VALUATION_VERSION, dailyValuationState } from './daily-valuation-state.ts';
import { isoDate,taiwanPerShareIssue,validRefreshCandles, type RefreshRecord } from './daily-refresh-data.ts';
import { detectValueTrendResonance } from './technical-analysis.ts';
import type { TechnicalSnapshot, TechnicalCandidate } from './technical-screener.ts';
import { rotationAudit } from './rotation-audit-store.ts';
import {buildTaiwanComparableMap} from './taiwan-comparables.ts';
import {withTaiwanBusinessGroup} from './taiwan-business-groups.ts';
import type {StockInput} from './valuation.ts';

export const REFRESH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS daily_refresh_runs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, completed_at TEXT, state TEXT NOT NULL, manifest TEXT NOT NULL, summary TEXT, error TEXT)`,
  `CREATE TABLE IF NOT EXISTS daily_refresh_records (run_id TEXT NOT NULL, market TEXT NOT NULL, ticker TEXT NOT NULL, status TEXT NOT NULL, stock TEXT, history TEXT, issues TEXT NOT NULL, upside REAL, signals INTEGER NOT NULL DEFAULT 0, eligible INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(run_id, market, ticker))`,
  `CREATE INDEX IF NOT EXISTS daily_refresh_ranking ON daily_refresh_records(run_id, market, status, upside)`,
  `CREATE TABLE IF NOT EXISTS daily_refresh_head (id INTEGER PRIMARY KEY CHECK(id=1), run_id TEXT NOT NULL)`,
];
export type Manifest = {valuationVersion?:string;expectedSessions:{TW:string;US:string}; targets:{ticker:string;market:'TW'|'US'}[]; universeSource:string[]};
type Run = {id:string;started_at:string;completed_at:string|null;state:string;manifest:string;summary:string|null;error:string|null};
type Stored = {ticker:string;market:'TW'|'US';status:string;stock:string|null;history:string|null;issues:string;upside:number|null;signals:number};
const response = (body:unknown,status=200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const taipeiDay = (date:Date) => new Date(date.getTime()+8*3600000).toISOString().slice(0,10);
export function refreshIsCurrent(startedAt:string,now=new Date()) {
  const start=Date.parse(startedAt), cutoff=new Date(now.getTime()-(Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'numeric',hourCycle:'h23'}).format(now))<8?86400000:0));
  return Number.isFinite(start)&&start<=now.getTime()+60000&&taipeiDay(new Date(start))>=taipeiDay(cutoff);
}
export function validateRecord(record:RefreshRecord,manifest:Manifest,runId?:string) {
  if (!manifest.targets.some(t=>t.market===record.market&&t.ticker===record.ticker)) throw new Error('UNKNOWN_TARGET');
  if (!['ready','unavailable'].includes(record.status)||!Array.isArray(record.issues)) throw new Error('INVALID_RECORD');
  const history=record.history,date=manifest.expectedSessions[record.market];
  if(history && (history.ticker!==record.ticker||history.market!==record.market||!history.name?.trim()
    ||history.quoteSource!=='Yahoo Finance daily close / daily-refresh-v1'||record.quoteDate!==date
    ||!validRefreshCandles(history.candles,date)||history.technicalAnalysis?.asOf!==date
  ))throw new Error('INVALID_CAUSAL_HISTORY');
  if(record.status==='unavailable') {
    if(!record.issues.length) throw new Error('FAILURE_REASON_REQUIRED');
    if(record.stock)throw new Error('UNAVAILABLE_RECORD_HAS_VALUATION_INPUT');
    if(history?.technicalAnalysis?.valueTrendResonance)throw new Error('INVALID_TECHNICAL_ONLY_HISTORY');
    if(!history&&record.rankingEligible)throw new Error('ELIGIBILITY_REQUIRES_HISTORY');
    return;
  }
  const s=record.stock, h=record.history;
  if(!s||!h||s.ticker!==record.ticker||s.market!==record.market||s.updatedAt!==manifest.expectedSessions[record.market]||h.candles.at(-1)?.date!==s.updatedAt||h.technicalAnalysis?.asOf!==s.updatedAt) throw new Error('INCONSISTENT_RECORD_DATES');
  if(!isoDate(s.financialDataDate)||s.priceSource!=='Yahoo Finance daily close / daily-refresh-v1'||s.price<=0||!['price','eps','bvps','fcfPerShare','revenueGrowth','roe','debtRatio'].every(k=>Number.isFinite(s[k as keyof typeof s]))) throw new Error('INVALID_FINANCIAL_INPUT');
  if(s.price!==h.candles.at(-1)?.close)throw new Error('PRICE_HISTORY_MISMATCH');
  if(s.financialDataDate!>s.updatedAt!||record.financialDate!==s.financialDataDate)throw new Error('FINANCIAL_DATE_MISMATCH');
  if(record.market==='TW'&&taiwanPerShareIssue(s))throw new Error('EPS_SHARE_BASIS_RECONCILIATION_REQUIRED');
  if(record.market==='TW'&&(manifest.valuationVersion!==DAILY_VALUATION_VERSION
    ||s.valuationPolicy!=='tw-comparables-v1'||s.dailyValuationVersion!==DAILY_VALUATION_VERSION
    ||!s.dailyRunId||(runId&&s.dailyRunId!==runId)))throw new Error('TW_DAILY_VALUATION_REFRESH_REQUIRED');
}
export async function statusData(db:D1Database) {
  const run=await db.prepare('SELECT r.* FROM daily_refresh_runs r JOIN daily_refresh_head h ON h.run_id=r.id WHERE h.id=1').first<Run>();
  const latest=await db.prepare('SELECT id,started_at,state,error FROM daily_refresh_runs ORDER BY started_at DESC LIMIT 1').first<Run>();
  const state=!run?'unavailable':!refreshIsCurrent(run.started_at)?'stale':latest?.state==='failed'?'refresh_failed':run.state;
  return {state,runId:run?.id??null,startedAt:run?.started_at??null,completedAt:run?.completed_at??null,
    expectedSessions:run?JSON.parse(run.manifest).expectedSessions:null,coverage:run?.summary?JSON.parse(run.summary):null,
    valuationVersion:run?JSON.parse(run.manifest).valuationVersion??null:null,
    taiwanValuationCurrent:!!run&&JSON.parse(run.manifest).valuationVersion===DAILY_VALUATION_VERSION,
    latestAttempt:latest,source:'Yahoo Finance public daily OHLC and quarterly/TTM financials',schedule:'Asia/Taipei 06:30 / 07:30 retry',
    note:'收盤資料；財報每日檢查，依公司公告頻率更新。財報不足時不列入估值排名，已驗證的 K 線與純技術訊號仍可使用；估值為本站模型計算，非外部 AI 排名。'};
}
function candidates(rows:Stored[],runId:string,taiwanCurrent:boolean):TechnicalSnapshot {
  const out:TechnicalSnapshot={asOf:'',trendPullback:[],valueTrend:[],stage2Breakout:[],morningStar:[],eveningStar:[]};
  for(const row of rows) {
    if(!row.history)continue;
    const input=row.status==='ready'&&row.stock?JSON.parse(row.stock):null;
    const state=dailyValuationState(row.market==='TW'&&!taiwanCurrent?null:input,runId),s=state.stock,h=JSON.parse(row.history),a=h.technicalAnalysis;
    if(!a||(!input&&!h.name))continue;
    if(!state.rankingEligible)a.valueTrendResonance=null;
    out.asOf=out.asOf>a.asOf?out.asOf:a.asOf;
    const base={...h,ticker:row.ticker,name:input?.name??h.name,market:row.market,price:input?.price??h.candles.at(-1)?.close,
      fairValue:state.rankingEligible&&s?(s.calibratedFairValue??s.fairValue):null,upside:state.upside,
      supportLevel:a.supportLevel,resistanceLevel:a.resistanceLevel,volumeRatio20:a.volumeRatio20,
      actionGuideZh:'依實際收盤訊號觀察；型態不保證後續走勢。',actionGuideEn:'Observe the completed-bar signal; it does not guarantee future returns.'};
    const add=(key:keyof Omit<TechnicalSnapshot,'asOf'>,category:TechnicalCandidate['category'],zh:string,en:string,stage:TechnicalCandidate['stage'],descZh:string,descEn:string) => {
      if(out[key].length<20)out[key].push({...base,category,patternNameZh:zh,patternNameEn:en,stage,descriptionZh:descZh,descriptionEn:descEn});
    };
    if(a.trendPullback&&a.trendPullback.status!=='none')add('trendPullback','trend-pullback','順勢回踩','Trend pullback',a.trendPullback.status,a.trendPullback.signalReasonZh,a.trendPullback.signalReasonEn);
    if(s&&state.upside!==null&&a.valueTrendResonance&&state.upside>=0.15&&s.fcfPerShare>0&&s.roe>=10&&s.debtRatio<=70)add('valueTrend','value-trend','價值趨勢共振','Value trend',a.valueTrendResonance.status,a.valueTrendResonance.signalReasonZh,a.valueTrendResonance.signalReasonEn);
    if(a.stage2Breakout)add('stage2Breakout','stage2-breakout','第二階段突破','Stage 2 breakout',a.stage2Breakout.status,a.stage2Breakout.signalReasonZh,a.stage2Breakout.signalReasonEn);
    if(a.candlestickPattern.startsWith('morning-star'))add('morningStar','morning-star','早晨之星','Morning star',a.patternStage,'實際日 K 線與支撐條件符合既有量化規則。','Actual daily candles meet the existing pattern and support rules.');
    if(a.candlestickPattern.startsWith('evening-star'))add('eveningStar','evening-star','黃昏之星','Evening star',a.patternStage,'實際日 K 線與壓力條件符合既有量化規則。','Actual daily candles meet the existing pattern and resistance rules.');
  }
  return out;
}
export async function handleDailyRead(request:Request,db:D1Database|undefined):Promise<Response|null> {
  const url=new URL(request.url),path=url.pathname;
  if(!['/api/daily-status','/api/technical-scan','/api/market-scan','/api/valuation','/api/price-history','/api/rotation-audit'].includes(path))return null;
  if(!db)return ['/api/daily-status','/api/technical-scan','/api/rotation-audit'].includes(path)?response({state:'unavailable',error:'DAILY_DATABASE_UNAVAILABLE'},503):null;
  try {
    const status=await statusData(db);
    if(path==='/api/daily-status')return response(status);
    if(!['complete','partial'].includes(status.state))return response({error:'每日資料尚未完成或已過期，暫停顯示排名與估值。',freshness:status},503);
    if(path==='/api/rotation-audit') {
      if(request.method!=='GET')return response({error:'METHOD_NOT_ALLOWED'},405);
      const market=url.searchParams.get('market')??'TW';
      if(market!=='TW'&&market!=='US')return response({error:'INVALID_MARKET'},400);
      const scope=url.searchParams.get('scope')??'all';
      if(scope!=='all'&&scope!=='technology')return response({error:'INVALID_SCOPE'},400);
      return response({...await rotationAudit(db,status.runId!,market,scope,status.taiwanValuationCurrent),freshness:status});
    }
    if(path==='/api/market-scan') {
      const byMarket=await Promise.all(['TW','US'].map(async market=>{
        if(market==='TW'&&!status.taiwanValuationCurrent)return {low:[],high:[]};
        const q=(direction:string)=>db.prepare(`SELECT stock FROM daily_refresh_records WHERE run_id=? AND market=? AND status='ready' AND eligible=1 AND upside IS NOT NULL AND upside ${direction==='DESC'?'>=0.05':'<=-0.05'}
          AND (market!='TW' OR (json_extract(stock,'$.valuationPolicy')='tw-comparables-v1' AND json_extract(stock,'$.dailyValuationVersion')=? AND json_extract(stock,'$.dailyRunId')=run_id))
          ORDER BY upside ${direction},ticker LIMIT 100`).bind(status.runId,market,DAILY_VALUATION_VERSION).all<Stored>();
        const [low,high]=await Promise.all([q('DESC'),q('ASC')]);return {low:low.results??[],high:high.results??[]};
      }));
      return response({candidates:byMarket.flatMap(x=>x.low.map(r=>JSON.parse(r.stock!))),overvaluedCandidates:byMarket.flatMap(x=>x.high.map(r=>JSON.parse(r.stock!))),
        scannedCount:status.coverage.total,scannedByMarket:{TW:status.coverage.TW.total,US:status.coverage.US.total},freshness:status});
    }
    if(path==='/api/technical-scan') {
      // Keep both markets in the bounded technical sample, without sorting on
      // a valuation that is deliberately absent for technical-only records.
      const rows=await db.prepare(`WITH ranked AS (
        SELECT *,ROW_NUMBER() OVER (PARTITION BY market ORDER BY ticker) AS market_position
        FROM daily_refresh_records WHERE run_id=? AND history IS NOT NULL AND eligible=1 AND signals=1
      ) SELECT * FROM ranked WHERE market_position<=125 ORDER BY market_position,market,ticker`).bind(status.runId).all<Stored>();
      return response({...candidates(rows.results??[],status.runId!,status.taiwanValuationCurrent),freshness:status});
    }
    const body=path==='/api/valuation'?await request.clone().json():{ticker:url.searchParams.get('ticker'),market:url.searchParams.get('market')};
    const ticker=String(body.ticker??'').toUpperCase().replace(/\.(TW|TWO)$/,''),market=body.market??(/^\d/.test(ticker)?'TW':'US');
    if(!/^[A-Z0-9.-]{1,12}$/.test(ticker)||!['TW','US'].includes(market))return response({error:'INVALID_TICKER'},400);
    const row=await db.prepare('SELECT * FROM daily_refresh_records WHERE run_id=? AND market=? AND ticker=?').bind(status.runId,market,ticker).first<Stored>();
    const value=dailyValuationState(row?.status==='ready'&&row.stock&&!(market==='TW'&&!status.taiwanValuationCurrent)?JSON.parse(row.stock):null,status.runId!);
    const issues=[...new Set([...(row?JSON.parse(row.issues):['OUTSIDE_REFRESH_UNIVERSE']),...value.issues])];
    if(path==='/api/price-history'&&row?.history) {
      const history=JSON.parse(row.history);
      if(!value.rankingEligible&&history.technicalAnalysis)history.technicalAnalysis.valueTrendResonance=null;
      return response({...history,valuationAvailable:value.rankingEligible,issues,freshness:status});
    }
    if(!row||row.status!=='ready')return response({error:'此股本次資料不足，未使用舊估值。',issues:row?JSON.parse(row.issues):['OUTSIDE_REFRESH_UNIVERSE'],freshness:status},422);
    if(!value.rankingEligible)return response({error:'此股估值模型不足或待覆核，未使用舊估值；仍可查看 K 線。',issues,freshness:status},422);
    return response(path==='/api/valuation'?{stock:JSON.parse(row.stock!),cache:'daily-refresh',freshness:status}:{...JSON.parse(row.history!),freshness:status});
  }catch {return response({state:'unavailable',error:'DAILY_DATABASE_READ_FAILED'},503);}
}
export async function handleRefreshWrite(request:Request,db:D1Database|undefined,secret:string|undefined):Promise<Response> {
  if(request.method!=='POST')return response({error:'METHOD_NOT_ALLOWED'},405);
  const supplied=request.headers.get('X-WenYing-Refresh-Key')??'';
  if(!secret||supplied.length<32)return response({error:'UNAUTHORIZED'},401);
  const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [a,b]=await Promise.all([digest(secret),digest(supplied)]);
  if(a.reduce((v,n,i)=>v|(n^b[i]),0)!==0)return response({error:'UNAUTHORIZED'},401);
  if(!db)return response({error:'DATABASE_UNAVAILABLE'},503);
  try {
    const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>1500000)return response({error:'PAYLOAD_TOO_LARGE'},413);
    const body=JSON.parse(raw),id=String(body.runId??'');
    if(!/^[a-zA-Z0-9_-]{8,90}$/.test(id))throw new Error('INVALID_RUN_ID');
    if(body.action==='begin') {
      const m=body.manifest as Manifest;
      if(!m||!isoDate(m.expectedSessions?.TW)||!isoDate(m.expectedSessions?.US)||!Array.isArray(m.targets)||m.targets.length<20||m.targets.length>10000)throw new Error('INVALID_MANIFEST');
      if(m.valuationVersion!==DAILY_VALUATION_VERSION)throw new Error('VALUATION_VERSION_MISMATCH');
      if(m.targets.some(t=>!['TW','US'].includes(t.market)||! /^[A-Z0-9.-]{1,12}$/.test(t.ticker))||new Set(m.targets.map(t=>t.market+':'+t.ticker)).size!==m.targets.length)throw new Error('INVALID_TARGETS');
      await db.batch(REFRESH_SCHEMA.map(sql=>db.prepare(sql)));
      const existing=await db.prepare('SELECT * FROM daily_refresh_runs WHERE id=?').bind(id).first<Run>();
      if(existing) {
        if(existing.manifest!==JSON.stringify(m))throw new Error('RUN_MANIFEST_CONFLICT');
        return response({runId:id,state:existing.state});
      }
      await db.prepare("INSERT OR IGNORE INTO daily_refresh_runs(id,started_at,state,manifest) VALUES(?,?,'running',?)").bind(id,new Date().toISOString(),JSON.stringify(m)).run();
      return response({runId:id,state:'running'});
    }
    const run=await db.prepare('SELECT * FROM daily_refresh_runs WHERE id=?').bind(id).first<Run>();
    if(!run)throw new Error('UNKNOWN_RUN');
    if(body.action==='fail') {
      if(['running','validating'].includes(run.state))await db.prepare("UPDATE daily_refresh_runs SET state='failed',error=?,completed_at=? WHERE id=? AND state IN ('running','validating')").bind(String(body.error??'COLLECTOR_FAILED').slice(0,250),new Date().toISOString(),id).run();
      return response({state:['running','validating'].includes(run.state)?'failed':run.state});
    }
    if(run.state!=='running'&&!(run.state==='validating'&&body.action==='finalize'))return response({state:run.state,runId:id});
    const m=JSON.parse(run.manifest) as Manifest;
    if(m.valuationVersion!==DAILY_VALUATION_VERSION)throw new Error('VALUATION_VERSION_MISMATCH');
    if(body.action==='batch') {
      const records=body.records as RefreshRecord[];
      if(!Array.isArray(records)||records.length<1||records.length>20)throw new Error('INVALID_BATCH');
      for(const r of records)validateRecord(r,m,id);
      await db.batch(records.map(r=>{
        const state=dailyValuationState(r.status==='ready'?r.stock:null,id);
        const history=r.history?{...r.history,technicalAnalysis:{...r.history.technicalAnalysis,
          valueTrendResonance:detectValueTrendResonance(r.history.candles,state.upside)}}:undefined;
        const h=history?.technicalAnalysis;
        const signals=!!(h&&(h.trendPullback?.status&&h.trendPullback.status!=='none'||h.valueTrendResonance||h.stage2Breakout||h.candlestickPattern?.includes('star')));
        return db.prepare(`INSERT OR REPLACE INTO daily_refresh_records(run_id,market,ticker,status,stock,history,issues,upside,signals,eligible)
          SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM daily_refresh_runs WHERE id=? AND state='running')`).bind(id,r.market,r.ticker,r.status,r.stock?JSON.stringify(r.stock):null,history?JSON.stringify(history):null,JSON.stringify([...new Set([...r.issues,...state.issues])]),state.upside,signals?1:0,r.rankingEligible?1:0,id);
      }));return response({accepted:records.length});
    }
    if(body.action==='finalize') {
      const counts=await db.prepare('SELECT market,status,COUNT(*) n FROM daily_refresh_records WHERE run_id=? GROUP BY market,status').bind(id).all<{market:'TW'|'US';status:string;n:number}>();
      const summary={total:m.targets.length,TW:{total:0,ready:0,unavailable:0},US:{total:0,ready:0,unavailable:0}};
      for(const market of ['TW','US'] as const) {
        summary[market].total=m.targets.filter(t=>t.market===market).length;
        summary[market].ready=counts.results?.find(r=>r.market===market&&r.status==='ready')?.n??0;
        summary[market].unavailable=counts.results?.find(r=>r.market===market&&r.status==='unavailable')?.n??0;
        if(summary[market].ready+summary[market].unavailable!==summary[market].total)throw new Error('INCOMPLETE_BATCHES');
        if(summary[market].ready<Math.min(100,Math.ceil(summary[market].total*0.2)))throw new Error('INSUFFICIENT_MARKET_COVERAGE');
      }
      // Seal the complete cohort before validation. Late in-flight uploads have
      // an SQL state guard, so they cannot mutate a validating/published run.
      await db.prepare("UPDATE daily_refresh_runs SET state='validating' WHERE id=? AND state='running'").bind(id).run();
      const sealed=await db.prepare('SELECT * FROM daily_refresh_runs WHERE id=?').bind(id).first<Run>();
      if(sealed?.state!=='validating')throw new Error('GENERATION_NOT_VALIDATING');
      const sealedCounts=await db.prepare('SELECT market,status,COUNT(*) n FROM daily_refresh_records WHERE run_id=? GROUP BY market,status').bind(id).all();
      if(JSON.stringify(sealedCounts.results)!==JSON.stringify(counts.results))throw new Error('GENERATION_CHANGED_DURING_FINALIZE');
      // Rebuild peer evidence from this generation, not a collector assertion
      // or an earlier batch with the same quote date. No OHLC is loaded here.
      const stocks:StockInput[]=[];
      let afterTicker='';
      for(;;) {
        const page=await db.prepare("SELECT ticker,stock FROM daily_refresh_records WHERE run_id=? AND market='TW' AND status='ready' AND ticker>? ORDER BY ticker LIMIT 500").bind(id,afterTicker).all<{ticker:string;stock:string}>();
        for(const row of page.results??[])stocks.push(JSON.parse(row.stock) as StockInput);
        if(!page.results?.length||page.results.length<500)break;
        afterTicker=page.results.at(-1)!.ticker;
      }
      const peers=buildTaiwanComparableMap(stocks);
      for(const stock of stocks) {
        if(stock.dailyRunId!==id||stock.dailyValuationVersion!==DAILY_VALUATION_VERSION
          ||JSON.stringify(stock.taiwanBusinessGroup??null)!==JSON.stringify(withTaiwanBusinessGroup(stock).taiwanBusinessGroup??null)
          ||JSON.stringify(stock.comparableMultiples??null)!==JSON.stringify(peers.get(stock.ticker)??null))throw new Error('GENERATION_PEER_EVIDENCE_MISMATCH');
      }
      const head=await db.prepare('SELECT r.* FROM daily_refresh_runs r JOIN daily_refresh_head h ON h.run_id=r.id WHERE h.id=1').first<Run>();
      if(head&&head.started_at>run.started_at)throw new Error('NEWER_GENERATION_ALREADY_ACTIVE');
      const state=summary.TW.unavailable+summary.US.unavailable?'partial':'complete';
      await db.batch([
        db.prepare("UPDATE daily_refresh_runs SET state=?,summary=?,completed_at=? WHERE id=? AND state='validating'").bind(state,JSON.stringify(summary),new Date().toISOString(),id),
        db.prepare(`INSERT INTO daily_refresh_head(id,run_id) SELECT 1,? WHERE EXISTS (SELECT 1 FROM daily_refresh_runs WHERE id=? AND state IN ('complete','partial')) ON CONFLICT(id) DO UPDATE SET run_id=excluded.run_id
          WHERE (SELECT started_at FROM daily_refresh_runs WHERE id=excluded.run_id)>=(SELECT started_at FROM daily_refresh_runs WHERE id=daily_refresh_head.run_id)`).bind(id,id),
      ]);
      // Retain the active and immediately previous generation, not unbounded OHLC history.
      await db.prepare(`DELETE FROM daily_refresh_records WHERE run_id NOT IN (
        SELECT run_id FROM daily_refresh_head UNION SELECT id FROM daily_refresh_runs WHERE state IN ('running','validating')
        UNION SELECT id FROM (SELECT id FROM daily_refresh_runs WHERE state IN ('complete','partial') ORDER BY completed_at DESC LIMIT 2)
      )`).run();
      return response({runId:id,state,coverage:summary});
    }
    throw new Error('UNKNOWN_ACTION');
  }catch(e){return response({error:e instanceof Error?e.message:'REFRESH_FAILED'},400);}
}
