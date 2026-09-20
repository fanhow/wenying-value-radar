"use client";
import {useEffect,useState} from 'react';
import type {RotationAuditResult} from '../../lib/rotation-audit-store';
import {stockDetailHref} from '../../lib/navigation';
import {useLanguage} from '../language-context';
import styles from './rotation.module.css';

type Payload=RotationAuditResult&{freshness:{state:string;expectedSessions:Record<string,string>;completedAt:string;note:string}};
const num=(n:number|null|undefined,d=2)=>n===null||n===undefined?'—':n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const signed=(n:number|null|undefined)=>n===null||n===undefined?'—':`${n>0?'+':''}${num(n,1)}`;
export default function LiveAudit(){
  const {t}=useLanguage();
  const [market,setMarket]=useState<'TW'|'US'>('TW'),[retry,setRetry]=useState(0);
  const [data,setData]=useState<Payload|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
  useEffect(()=>{
    const abort=new AbortController();let active=true;
    async function load(){
      setBusy(true);setData(null);setError('');
      try {const response=await fetch(`/api/rotation-audit?market=${market}`,{signal:abort.signal,cache:'no-store'});
        const result=await response.json();if(!response.ok)throw new Error(result.error??'資料服務未就緒');
        if(active)setData(result);
      }catch(e){if(active)setError(e instanceof Error?e.message:'資料服務未就緒');}
      finally{if(active)setBusy(false);}
    }
    void load();return()=>{active=false;abort.abort();};
  },[market,retry]);
  return <section className={styles.panel} aria-labelledby="live-audit-heading">
    <h2 id="live-audit-heading">{t('二十檔估值差異與獨立研究榜','Twenty-stock comparison and independent research screen')}</h2>
    <div className={styles.auditControls}><label className={styles.field}>{t('比較市場','Market')}<select value={market} onChange={e=>setMarket(e.target.value as 'TW'|'US')}><option value="TW">台灣 / Taiwan</option><option value="US">美國 / US</option></select></label><button className={styles.button} disabled={busy} onClick={()=>setRetry(n=>n+1)}>{t('重新讀取本站資料','Refresh site data')}</button></div>
    <p>{t('外部參考是你提供的上漲空間前十檔，不是 ProPicks AI 持股排名。參考值固定於 2026-09-20 核對，本站欄位讀取現行每日收盤資料。','The reference is your ten highest-upside stocks, not a ProPicks AI ranking. References were checked on 20 September 2026; site values read the current daily-close generation.')}</p>
    {busy&&<p role="status">{t('正在讀取同一批估值與排名…','Loading a consistent valuation and ranking generation…')}</p>}
    {error&&<div className={styles.error} role="alert">{t('目前資料不可用；不改用快照或虛構排名。','Data unavailable; no snapshot or fabricated ranking is substituted.')} {error}</div>}
    {data&&<>
      <p className={styles.muted}>{market==='TW'?'TWD':'USD'} · {t('本站股價日','Site quote date')} {data.freshness.expectedSessions[market]} · {t('完成擷取','Refresh completed')} {new Date(data.freshness.completedAt).toLocaleString()} · {data.freshness.state==='partial'?t('部分股票缺資料','Partial coverage'):t('本批完成','Generation complete')}</p>
      <div className={styles.metrics}><div><span>{t('可讀取／比較標的','Available / requested')}</span><strong>{data.summary.available}/{data.summary.total}</strong></div><div><span>{t('同日同價可比','Date/price-aligned')}</span><strong>{data.summary.matched}/{data.summary.total}</strong></div><div><span>{t('公允價值平均絕對差異','Mean absolute FV gap')}</span><strong>{num(data.summary.meanAbsoluteGapPct,1)}{data.summary.meanAbsoluteGapPct===null?'':'%'}</strong></div><div><span>{t('兩個估值前十重疊','FV top-ten overlap')}</span><strong>{data.screenshotOverlap.length}/10</strong></div></div>
      <p className={styles.muted}>{t('差異 =（本站公允價值 ÷ 外部公允價值 − 1）。正值表示本站較高；不是投資報酬或預測準確率。只有日期相同且股價差在 0.1% 內者納入平均；缺值不算零。','Gap = site FV / reference FV − 1. Positive means the site is higher, not an investment return or accuracy score. Means include matching dates and prices within 0.1%; missing values are not zero.')}</p>
      <div className={styles.tableWrap}><table className={styles.table}><caption>{t('逐股比較：依你提供的外部上漲空間排序','Stock comparison, ordered by your reference upside')}</caption><thead><tr>{[t('標的','Stock'),t('參考／本站股價','Reference / site price'),t('外部公允價值','Reference FV'),t('本站公允價值','Site FV'),t('差異','Gap'),t('本站模型數','Site models'),t('資料狀態','Data status')].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{data.compared.map(r=><tr key={r.ticker}><td><a href={stockDetailHref(r.ticker)}>{r.ticker} {r.name}</a></td><td>{num(r.price)} / {num(r.actual?.price)}</td><td><a href={r.source} target="_blank" rel="noreferrer">{num(r.fairValue)}</a><small className={styles.cellNote}>+{num(r.upsidePct,1)}%</small></td><td>{num(r.actual?.fairValue)}</td><td>{signed(r.gapPct)}{r.gapPct===null?'':'%'}</td><td>{r.actual?.modelCount??'—'}</td><td>{r.aligned?t('同日同價','Aligned'):r.actual?t('日期／價格不同，排除平均','Unaligned; excluded'):t('缺資料','Unavailable')}<small className={styles.cellNote}>{r.actual?.financialDate??r.issues.join(' · ')}</small></td></tr>)}</tbody></table></div>
      <details className={styles.auditDetail}><summary>{t('本站現行公允價值前十檔','Current site FV top ten')}</summary><p>{data.top10.map(r=>`${r.rank}. ${r.ticker} ${r.name} (${signed(r.upsidePct)}%)`).join(' · ')}</p><p>{t('這是原有依低估空間排序的榜單，並非下方多因子榜。','This is the existing upside-ranked list, not the multi-factor screen below.')}</p></details>
      <h3>{t('穩盈四因子前十研究候選','WenYing four-factor top-ten research candidates')}</h3>
      <p>{t('價值、品質、成長、動能各 25%；為獨立透明基準，未訓練、未回測，也不是原廠 AI 或買賣訊號。','Value, quality, growth and momentum each carry 25%. This is an independent transparent baseline: untrained, not backtested, not vendor AI or a trade signal.')}</p>
      <p className={styles.muted}>{data.screen.version} · {t('股票目錄','Directory')} {data.screen.universe} → {t('可用資料','Available')} {data.screen.ready} → {t('符合研究門檻','Research eligible')} {data.screen.eligible}</p>
      <div className={styles.tableWrap}><table className={styles.table}><caption>{t('依本站自訂分數排序；不使用外部目標價或持股標籤','Independent scores; no vendor price targets or holdings labels')}</caption><thead><tr>{[t('名次／標的','Rank / stock'),t('總分','Score'),t('價值','Value'),t('品質','Quality'),t('成長','Growth'),t('動能','Momentum'),t('63 日價格變動','63-session price change')].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{data.screen.candidates.map(r=><tr key={r.ticker}><td>{r.rank}. <a href={stockDetailHref(r.ticker)}>{r.ticker} {r.name}</a></td><td>{num(r.score,1)}</td><td>{num(r.valueScore,1)}</td><td>{num(r.qualityScore,1)}</td><td>{num(r.growthScore,1)}</td><td>{num(r.momentumScore,1)}</td><td>{signed(r.momentum63*100)}%</td></tr>)}</tbody></table></div>
      {!data.screen.candidates.length&&<p>{t('不足十檔符合條件，不補滿名單。','Fewer than ten eligible records; no padded list.')}</p>}
      <details className={styles.auditDetail}><summary>{t('公式、範圍與限制','Formula, universe and limitations')}</summary><p>{t('同市場合格股票的百分位分數（平手取平均）；價值＝盈餘殖利率與 FCF 殖利率平均；品質＝ROE 與低負債比例平均；成長＝營收成長；動能＝21／63 交易日價格變動平均。四組分數等權，平手按代碼排序。','Within-market percentile scores with average ties: value averages earnings and FCF yields; quality averages ROE and inverse liabilities/assets; growth uses revenue growth; momentum averages 21- and 63-session price changes. Four groups are equally weighted; score ties sort by ticker.')}</p><p>{t('只用本批具流動性、正 EPS／FCF／ROE、至少 64 根日 K 的股票；排除金融與 REIT。依既有目錄分類，不代表 S&P 500 或 Berkshire 當期成分。營收可能是 TTM YoY 或最新季 YoY，需再統一口徑；動能不含股息。產業組成、股份變動與財報可得時點仍會影響結果。','Requires current eligible liquidity, positive EPS/FCF/ROE and 64 daily bars; excludes financial firms and REITs. Directory classifications are not current S&P 500 or Berkshire membership. Revenue growth may be TTM YoY or latest-quarter YoY and needs harmonization. Momentum excludes dividends; sector mix, share changes and filing availability remain limitations.')}</p><p>{t('這二十檔是偏向高估值空間的指定樣本，不能當訓練集再宣稱樣本外準確度。尚未建立逐月不可變來源名單與可成交成本資料，不顯示回測報酬。','These twenty high-upside references are a selected sample, not an out-of-sample validation set. No return backtest is shown without immutable monthly source baskets and execution/cost data.')}</p></details>
    </>}
    <details className={styles.auditDetail}><summary>{t('外部策略名單與這二十檔的差異','How the external strategy baskets differ from these twenty stocks')}</summary><p>{t('2026-09-20 核對：台灣晶片冠軍實為 15 檔月更持股，與你台股十檔只重疊元太、和碩（2/10）。美國 Beat S&P 500／Top Value Stocks 各 20 檔月更；Tech Titans 15 檔月更；Best of Buffett 15 檔季更。這四組與你美股十檔均無重疊（0/10）。','Checked 20 September 2026: Taiwan Chip Champions holds 15 monthly members; only E Ink and Pegatron overlap your ten Taiwan stocks (2/10). Beat S&P 500 and Top Value Stocks hold 20 monthly; Tech Titans 15 monthly; Best of Buffett 15 quarterly. None of those four baskets overlaps your ten US references (0/10).')}</p><p>{t('這些是當次觀察，不會隨本站重新讀取自動更新；原頁表格順序不視為未公開的逐股 AI 分數。完整付費持股表不複製到網站。','These are dated observations, not refreshed by the site-data button. Source table order is not an undisclosed AI score. Full paid holdings tables are not reproduced.')}</p></details>
  </section>;
}
