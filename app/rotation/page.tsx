"use client";

import { useState } from "react";
import { ROTATION_PROFILES, ROTATION_CASES, RESEARCH_REVIEWED_AT, RESEARCH_FINDINGS, strategySource, type RotationProfile } from "../../lib/rotation-research";
import { buildRotationPlan, type RotationPlan } from "../../lib/rotation-plan";
import { stockDetailHref } from "../../lib/navigation";
import { useLanguage } from "../language-context";
import { SiteHeader } from "../site-header";
import { SiteFooter } from "../site-footer";
import styles from "./rotation.module.css";
import LiveAudit from './live-audit';

function RotationReview({ profile }: { profile: RotationProfile }) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState("");
  const [previous, setPrevious] = useState("");
  const [proposed, setProposed] = useState("");
  const [initialBasket, setInitialBasket] = useState(false);
  const [membershipConfirmed, setMembershipConfirmed] = useState(false);
  const [scheduleConfirmed, setScheduleConfirmed] = useState(false);
  const [sourceObservedAt, setSourceObservedAt] = useState("");
  const [result, setResult] = useState<{ plan: RotationPlan | null; errors: string[] } | null>(null);
  const clearResult = () => setResult(null);
  return <section className={styles.panel} aria-labelledby="review-heading">
    <h2 id="review-heading">{t("完整名單 → 等權調倉檢查", "Complete baskets → equal-weight rotation review")}</h2>
    <p>{t("由你核對後貼入名單，才計算新增／續留／移出。代碼順序不視為 AI 排名；不連接券商、不送出訂單、不推估成交價。內容只在此頁暫存，重新整理即清空。", "Paste lists you have verified to compare additions, retained members and removals. Input order is not an AI ranking. No brokerage connection, orders, or assumed fills. Form data is held only in this page and clears on refresh.")}</p>
    <form onSubmit={(event) => { event.preventDefault(); setResult(buildRotationPlan({ profileId: profile.id, period, previous, proposed, initialBasket, membershipConfirmed, scheduleConfirmed, sourceObservedAt, preparedAt: new Date().toISOString() })); }} onChange={clearResult}>
      <div className={styles.formGrid}>
        <label className={styles.field}>{t("原頁名單更新期", "Source list update month")}<input type="month" value={period} required onChange={(event) => setPeriod(event.target.value)} /></label>
        <label className={styles.field}>{t("實際核對來源時間（含時區）", "Actual source-review time (with timezone)")}<input type="text" value={sourceObservedAt} placeholder="YYYY-MM-DDTHH:mm:ss+08:00" required onChange={(event) => setSourceObservedAt(event.target.value)} /></label>
        <label className={styles.field}>{t("上期完整名單", "Complete previous basket")}<textarea value={previous} onChange={(event) => setPrevious(event.target.value)} placeholder={t("只貼代碼，逗號或換行分隔；首次建組留白。", "Tickers only, separated by commas or newlines. Leave empty for initial basket.")} /></label>
        <label className={styles.field}>{t(`本期完整 ${profile.holdings} 檔名單`, `Complete current basket (${profile.holdings})`)}<textarea value={proposed} required onChange={(event) => setProposed(event.target.value)} placeholder={t("請從已核對的來源貼入；此頁不提供假名單。", "Paste a verified list; no fabricated picks are supplied.")} /></label>
      </div>
      <label className={styles.check}><input type="checkbox" checked={initialBasket} onChange={(event) => setInitialBasket(event.target.checked)} />{t("這是首次建組，沒有上期持股。", "Initial basket: no previous holdings.")}</label>
      <label className={styles.check}><input type="checkbox" checked={membershipConfirmed} onChange={(event) => setMembershipConfirmed(event.target.checked)} />{t("我已核對兩期均屬此策略、市場及完整名單；明白此工具不驗證 AI 排名與股票資格。", "I verified the strategy, market and completeness of both lists. This tool does not verify AI ranking or stock eligibility.")}</label>
      <label className={styles.check}><input type="checkbox" checked={scheduleConfirmed} onChange={(event) => setScheduleConfirmed(event.target.checked)} />{profile.frequency === "monthly" ? t("我已核對本期更新與當地交易日曆，不把月初標籤直接當成交日。", "I checked this update and the local trading calendar; the month label is not an execution date.") : t("我已核對此季度策略實際更新月份與交易日曆，不套用月度更新假設。", "I checked this quarterly strategy's actual update month and trading calendar, without assuming monthly rebalancing.")}</label>
      <button type="submit" className={styles.button}>{t("產生調倉檢查表", "Create rotation review")}</button>
      <button type="button" className={styles.button} style={{ marginLeft: 12 }} onClick={() => { setSourceObservedAt(new Date().toISOString()); clearResult(); }}>{t("我剛完成核對：填入現在時間", "Just verified: use current time")}</button>
    </form>
    {!result && <p className={styles.muted}>{t("尚未產生結果。缺少完整名單時，不產生候選或退場指令。", "No result yet. Incomplete lists do not produce candidates or exit instructions.")}</p>}
    {result?.errors.length ? <div className={styles.error} role="alert"><ul>{result.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></div> : null}
    {result?.plan && <div aria-live="polite">
      <h3>{t("人工覆核草稿，尚未執行", "Manual-review draft — not executed")}</h3>
      {result.plan.retrospective && <p className={styles.notice}>{t("這是歷史期別的名單比較，不是當時已知資料的回測，不能回填月初成交價。", "Historical list comparison only, not a point-in-time backtest. Do not backfill a month-start execution price.")}</p>}
      <p>{t("新增", "Added")} {result.plan.added} · {t("續留", "Retained")} {result.plan.retained} · {t("移出", "Removed")} {result.plan.removed}</p>
      <p className={styles.muted}>{t("續留標的也需檢查權重漂移。這裡顯示目標比例，不是買賣金額；尚未扣除費用、稅金、零股／整股限制或滑價。移出不等於看空。", "Retained positions also need a weight-drift review. These are target weights, not order sizes; costs, tax, lot sizes and slippage are not included. Removal does not mean bearish.")}</p>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>{t("代碼／現行估值", "Ticker / current valuation")}</th><th>{t("組合變動", "Membership change")}</th><th>{t("目標權重", "Target weight")}</th></tr></thead><tbody>{result.plan.rows.map((row) => <tr key={row.ticker}><td><a href={stockDetailHref(row.ticker)}>{row.ticker}</a></td><td>{row.action === "add" ? t("新納入研究", "Add for review") : row.action === "retain" ? t("續留／重檢等權", "Retain / check weight") : t("移出此模型組合", "Remove from model basket")}</td><td>{(row.targetWeight * 100).toFixed(2)}%</td></tr>)}</tbody></table></div>
      <p className={styles.muted}>{t("此處連結的是現在的估值頁，不是當期歷史估值。", "Valuation links show the current valuation, not historical values.")}</p>
      <p>{t("來源核對時間", "Source reviewed")}：{result.plan.sourceObservedAt}<br />{t("產生決策檢查時間", "Review generated")}：{result.plan.preparedAt}</p>
    </div>}
  </section>;
}

export default function RotationPage() {
  const { t } = useLanguage();
  const [profileId, setProfileId] = useState(ROTATION_PROFILES[0].id);
  const profile = ROTATION_PROFILES.find((item) => item.id === profileId)!;
  return <div className="app-shell">
    <SiteHeader active="rotation" />
    <main className={styles.main}>
      <header className={styles.heading}>
        <div><p className={styles.kicker}>WENYING / PORTFOLIO RESEARCH</p><h1>{t("量化輪動研究", "Portfolio rotation research")}</h1></div>
        <span>{t("來源核對", "Sources reviewed")} {RESEARCH_REVIEWED_AT}</span>
      </header>
      <div className={styles.notice}><strong>{t("估值比較、獨立研究、原始策略規則分開呈現。", "Valuation comparisons, independent research and source rules stay separate.")}</strong><p>{t("每日資料自動產生穩盈研究候選；不宣稱複製未公開的 AI 模型。既有公允價值、即時排行榜與人工調倉檢查仍保留。", "Daily data generates independent WenYing research candidates, not a replica of undisclosed AI. Existing valuations, live rankings and manual rotation reviews remain available.")}</p></div>
      <LiveAudit />
      <section className={styles.panel} aria-labelledby="profile-heading">
        <h2 id="profile-heading">{t("台灣與美國策略規則", "Taiwan and US strategy rules")}</h2>
        <label className={styles.field}>{t("選擇策略範圍", "Strategy universe")}<select value={profileId} onChange={(event) => setProfileId(event.target.value)}>{["TW", "US"].map((market) => <optgroup key={market} label={market === "TW" ? "台灣 / Taiwan" : "美國 / US"}>{ROTATION_PROFILES.filter((item) => item.market === market).map((item) => <option key={item.id} value={item.id}>{t(item.name, item.englishName)} · {item.holdings}</option>)}</optgroup>)}</select></label>
        <p className={styles.muted}>{t("切換策略會清除下方未儲存表單，避免混用不同市場或更新期。", "Changing strategy clears the unsaved form below to avoid mixing markets or update cycles.")}</p>
        <div className={styles.metrics}><div><span>{t("市場", "Market")}</span><strong>{profile.market}</strong></div><div><span>{t("最高持倉", "Maximum holdings")}</span><strong>{profile.holdings}</strong></div><div><span>{t("調整頻率", "Frequency")}</span><strong>{profile.frequency === "monthly" ? t("每月", "Monthly") : t("每季", "Quarterly")}</strong></div><div><span>{t("滿額等權目標", "Full-basket target weight")}</span><strong>{(100 / profile.holdings).toFixed(2)}%</strong></div></div>
        <p>{profile.universe}</p><p className={styles.muted}>{profile.limits}</p>
        <a href={strategySource(profile.id)} target="_blank" rel="noreferrer">{t("查看原始策略與名單 ↗", "View original strategy and holdings ↗")}</a><span className={styles.badge}>{profile.verification === "detail" ? t("已讀策略詳情", "Detail verified") : t("僅概覽已核對", "Overview only")}</span>
      </section>
      <RotationReview key={profile.id} profile={profile} />
      <section className={styles.panel}>
        <h2>{t("如何進場、續留與退出", "Entry, retention and exit")}</h2>
        <ol className={styles.steps}>
          <li>{t("核對策略範圍與新一期完整名單，記錄實際取得資訊的時間；月初標籤與實際交易日分開。", "Check the universe and complete new basket, recording when you actually received it. Separate the period label from the trading date.")}</li>
          <li>{t("追蹤模型組合時：新入選列入、續留者重檢等權、被替換者移出；不是所有股票每個月都重買。", "For model-basket tracking: include new members, rebalance retained members and remove replacements. Not every stock is new each month.")}</li>
          <li>{t("實際下單前另記你的決策與成交時間。若收到名單時已過參考收盤，不可回填該收盤為你的成交價。此頁只準備檢查表。", "Record your actual decision and fill times separately. If the reference close has passed, do not treat it as your fill. This page prepares a review only.")}</li>
          <li>{t("月內個人停損／停利、倉位上限及技術確認需另訂，屬於你的規則，不冒充原廠規則。季更策略依自身日程。", "Personal stops, profit-taking, position caps and technical confirmation need separate rules; they are not represented as vendor rules. Quarterly strategies follow their own schedule.")}</li>
        </ol>
      </section>
      <section className={styles.findings} aria-label="Research findings">{RESEARCH_FINDINGS.map((item) => <article className={styles.panel} key={item.title}><h2>{item.title}</h2><p>{item.body}</p><a href={item.source} target="_blank" rel="noreferrer">{t("原始來源 ↗", "Primary source ↗")}</a></article>)}</section>
      <section className={styles.panel} style={{ marginTop: 24 }}>
        <h2>{t("實際輪動案例：用來理解，不是推薦名單", "Observed rotations — evidence, not recommendations")}</h2>
        <p className={styles.muted}>{t("台灣抽查 2026 年 8、9 月，美國科技抽查 9 月。理由在本次查閱時可見，不代表已驗證為當時發布的不可變版本。", "Taiwan: August and September 2026; US technology: September. Rationales were visible when reviewed, not verified immutable point-in-time publications.")}</p>
        <div className={styles.cases}>{ROTATION_CASES.map((item) => <article className={styles.case} key={item.ticker}><strong>{item.label}</strong><p>{item.lesson}</p><a href={strategySource(item.source)} target="_blank" rel="noreferrer">{t("核對原頁歷史 ↗", "Check source history ↗")}</a></article>)}</div>
      </section>
      <section className={styles.panel}>
        <h2>{t("尚未取得的部分", "What remains unavailable")}</h2>
        <p>{t("完整特徵清單、特徵轉換、模型權重、訓練／驗證切分、逐股評分、平手規則，以及精確發布時刻尚未公開取得。取得 Pro+ 不等於取得模型或資料轉授權。", "The full feature set, transforms, weights, train/validation splits, stock scores, tie-breaking rules and exact release timestamps are unavailable. A Pro+ subscription is not a model or data redistribution licence.")}</p>
        <p>{t("若另建穩盈獨立排名，必須另列公式版本、可得資料與限制，累積前瞻觀察，再比較完整持股重疊率及調入／調出一致率；不能看完漲跌後再調權重宣稱複製成功。", "An independent WenYing ranking would need its own versioned formula, point-in-time data and limitations, followed by prospective comparisons of basket overlap and rotations — not retrospective weight tuning presented as replication.")}</p>
      </section>
    </main>
    <SiteFooter disclaimer={["研究工具，不是交易指令；未複製原廠 AI 模型，也不保證報酬。", "Research only, not trade instructions. Proprietary AI models are not replicated and returns are not guaranteed."]} motto={["分清來源、假設與決策", "Separate evidence, assumptions and decisions"]} />
  </div>;
}
