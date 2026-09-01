"use client";

import Image from "next/image";
import { useState } from "react";
import { useLanguage } from "../language-context";
import type { SetupLibraryItem } from "./setup-library";
import {
  EMPTY_AGGREGATE_METRICS,
  REAL_CASE_ANNOTATIONS,
  formatNullableMetric,
  type LocalizedText,
  type RealMarketCase,
} from "./real-market-cases";
import { RealCaseImage } from "./real-case-image";

function translated(value: LocalizedText, language: "zh" | "en") {
  return language === "zh" ? value.zh : value.en;
}

function CaseField({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function RealCaseDetail({ marketCase, language }: { marketCase: RealMarketCase; language: "zh" | "en" }) {
  const value = (number: number | null, suffix = "", digits = 2) => formatNullableMetric(number, suffix, digits);
  const t = (zh: string, en: string) => language === "zh" ? zh : en;
  const annotations = REAL_CASE_ANNOTATIONS[marketCase.id];

  return (
    <article className="real-case-detail">
      <header className="real-case-heading">
        <div>
          <span>{t("真實案例", "REAL MARKET CASE")}</span>
          <h3>{marketCase.symbol} · {marketCase.execution_timeframe}</h3>
        </div>
        <div className="real-case-meta">
          <span>{marketCase.market}</span>
          <span>{marketCase.direction.toUpperCase()}</span>
          <span>{marketCase.higher_timeframe ?? "—"}</span>
          <span>{marketCase.trade_date ?? "—"}</span>
        </div>
      </header>

      <div className="real-case-summary">
        <section><h4>{t("市場背景", "Market context")}</h4><p>{translated(marketCase.context, language)}</p></section>
        <section><h4>{t("交易論點", "Trade thesis")}</h4><p>{translated(marketCase.trade_thesis, language)}</p></section>
      </div>

      <RealCaseImage marketCase={marketCase} annotations={annotations} language={language} />

      <dl className="real-case-execution">
        <CaseField label={t("進場", "Entry")} value={`${value(marketCase.entry.price)} · ${translated(marketCase.entry.reason, language)}`} />
        <CaseField label={t("初始停損", "Initial stop")} value={`${value(marketCase.initial_stop.price)} · ${translated(marketCase.initial_stop.reason, language)}`} />
        <CaseField label={t("結構移動停損", "Structural trailing stop")} value={translated(marketCase.trailing_method, language)} />
        <CaseField label={t("出場", "Exit")} value={`${value(marketCase.exit.price)} · ${translated(marketCase.exit.reason, language)}`} />
      </dl>

      <ol className="real-case-trails">
        {marketCase.trailing_stops.map((stop, index) => (
          <li key={`${marketCase.id}-trail-${index}`}>
            <b>{t(`移動停損 ${index + 1}`, `Trail stop ${index + 1}`)}</b>
            <span>{value(stop.price)} · {translated(stop.reason, language)}</span>
          </li>
        ))}
      </ol>

      <div className="real-case-context-grid">
        <section>
          <h4>ADR</h4>
          <dl>
            <CaseField label={t("週期", "Period")} value={value(marketCase.adr.period, "", 0)} />
            <CaseField label={t("進場時完成度", "Used at entry")} value={value(marketCase.adr.completed_at_entry_percent, "%", 1)} />
            <CaseField label={t("高／低／目標", "High / Low / Target")} value={`${value(marketCase.adr.high)} / ${value(marketCase.adr.low)} / ${value(marketCase.adr.target)}`} />
          </dl>
        </section>
        <section>
          <h4>EMA</h4>
          <p>{translated(marketCase.ema.ema15_context, language)}</p>
          <p>{translated(marketCase.ema.ema50_context, language)}</p>
        </section>
        <section>
          <h4>{t("較高週期", "Higher timeframe")}</h4>
          <p>{translated(marketCase.higher_timeframe_context, language)}</p>
        </section>
      </div>

      <section className="real-case-outcome">
        <div><span>{t("結果 %", "Result %")}</span><b>{value(marketCase.performance.result_percent, "%", 1)}</b></div>
        <div><span>{t("結果 R", "Result R")}</span><b>{value(marketCase.performance.result_r, "R", 2)}</b></div>
        <p>{translated(marketCase.outcome_summary, language)}</p>
      </section>

      {marketCase.notes.map((note, index) => <p className="real-case-note" key={`${marketCase.id}-note-${index}`}>{translated(note, language)}</p>)}

      <section className="real-case-lessons">
        <h4>{t("案例復盤", "Case review")}</h4>
        <dl>
          <CaseField label={t("有效之處", "What worked")} value={translated(marketCase.lessons.what_worked, language)} />
          <CaseField label={t("不完美之處", "What was imperfect")} value={translated(marketCase.lessons.what_was_imperfect, language)} />
          <CaseField label={t("失效條件", "Invalidation")} value={translated(marketCase.lessons.invalidation, language)} />
          <CaseField label={t("A+ 條件", "A+ conditions")} value={translated(marketCase.lessons.a_plus, language)} />
          <CaseField label={t("降級條件", "Downgrade conditions")} value={translated(marketCase.lessons.downgrade, language)} />
        </dl>
      </section>
    </article>
  );
}

export function SetupLibraryCard({ setup, cases }: { setup: SetupLibraryItem; cases: RealMarketCase[] }) {
  const { language, t } = useLanguage();
  const [view, setView] = useState<"ideal" | "real">("ideal");
  const [selectedCaseId, setSelectedCaseId] = useState(cases[0]?.id ?? "");
  const metrics = EMPTY_AGGREGATE_METRICS;
  const metricRows = [
    [t("樣本數", "Sample size"), formatNullableMetric(metrics.sample_size, "", 0)],
    [t("勝率", "Win rate"), formatNullableMetric(metrics.win_rate_percent, "%")],
    [t("平均 R", "Average R"), formatNullableMetric(metrics.average_r, "R")],
    [t("期望值", "Expectancy"), formatNullableMetric(metrics.expectancy_r, "R")],
    [t("獲利因子", "Profit factor"), formatNullableMetric(metrics.profit_factor)],
    [t("最大連敗", "Max losing streak"), formatNullableMetric(metrics.max_losing_streak, "", 0)],
    [t("最大回撤", "Max drawdown"), formatNullableMetric(metrics.max_drawdown_percent, "%")],
  ];

  return (
    <article className="setup-library-card" id={setup.id}>
      <header>
        <span className="setup-number">{String(setup.number).padStart(2, "0")}</span>
        <div>
          <h2>{language === "zh" ? setup.titleZh : setup.titleEn}</h2>
          <p>{language === "zh" ? setup.titleEn : setup.titleZh}</p>
        </div>
        <span className={`setup-direction ${setup.direction}`}>
          {setup.direction === "long" ? t("多方 LONG", "LONG") : t("空方 SHORT", "SHORT")}
        </span>
      </header>

      <div className="setup-example-switch" role="tablist" aria-label={t("案例類型", "Example type")}>
        <button type="button" role="tab" aria-selected={view === "ideal"} className={view === "ideal" ? "active" : ""} onClick={() => setView("ideal")}>
          {t("理想模型", "Ideal Setup")} <small>{t("合成", "Synthetic")}</small>
        </button>
        <button type="button" role="tab" aria-selected={view === "real"} className={view === "real" ? "active" : ""} onClick={() => setView("real")}>
          {t("真實市場案例", "Real Market Cases")} <small>{cases.length}</small>
        </button>
      </div>

      <div className="setup-example-panel" hidden={view !== "ideal"}>
        <a className="setup-chart" href={`/setup-library/${setup.id}.svg`} target="_blank" rel="noreferrer" aria-label={t("開啟 SVG 向量圖", "Open SVG chart")}>
          <Image src={`/setup-library/${setup.id}.png`} alt={`${setup.titleZh} / ${setup.titleEn}`} width={2800} height={1750} unoptimized sizes="(max-width: 760px) 100vw, (max-width: 1080px) 80vw, 980px" />
        </a>
        <dl className="setup-rule-grid">
          <div><dt>{t("背景", "Context")}</dt><dd>{t(setup.contextZh, setup.contextEn)}</dd></div>
          <div><dt>{t("觸發", "Trigger")}</dt><dd>{t(setup.triggerZh, setup.triggerEn)}</dd></div>
          <div><dt>{t("失效", "Invalidation")}</dt><dd>{t(setup.invalidationZh, setup.invalidationEn)}</dd></div>
        </dl>
        <footer className="setup-downloads">
          <span>{t("下載教學圖", "Download chart")}</span>
          <a href={`/setup-library/${setup.id}.png`} download>PNG</a>
          <a href={`/setup-library/${setup.id}.svg`} download>SVG</a>
          <a href="#top">{t("回到頂端", "Back to top")} ↑</a>
        </footer>
      </div>

      <div className="setup-example-panel real-market-panel" hidden={view !== "real"}>
        <header className="real-market-panel-heading">
          <div><strong>{t("真實執行紀錄", "Real execution records")}</strong><span>{t("缺少證據的數值一律顯示 —", "Unverified numeric fields always display —")}</span></div>
          <small>{t("Phase 3 統計欄位已預留 · 目前資料不足", "Phase 3 metrics ready · not enough data")}</small>
        </header>
        <dl className="real-case-metrics">
          {metricRows.map(([label, metric]) => <div key={label}><dt>{label}</dt><dd>{metric}</dd></div>)}
        </dl>

        {cases.length === 0 ? (
          <div className="real-case-empty"><strong>{t("尚無已驗證真實案例", "No validated real-market case yet")}</strong><span>{t("理想模型仍可正常查看；不以不完整資料補湊案例。", "The ideal model remains available; incomplete evidence is never used to fabricate a case.")}</span></div>
        ) : (
          <>
            {cases.length > 1 ? (
              <div className="real-case-picker" role="tablist" aria-label={t("選擇真實案例", "Choose a real case")}>
                {cases.map((marketCase) => (
                  <button type="button" role="tab" aria-selected={selectedCaseId === marketCase.id} className={selectedCaseId === marketCase.id ? "active" : ""} key={marketCase.id} onClick={() => setSelectedCaseId(marketCase.id)}>
                    {marketCase.symbol} · {marketCase.execution_timeframe}
                  </button>
                ))}
              </div>
            ) : null}
            {cases.map((marketCase) => (
              <div key={marketCase.id} hidden={selectedCaseId !== marketCase.id}>
                <RealCaseDetail marketCase={marketCase} language={language} />
              </div>
            ))}
          </>
        )}
      </div>
    </article>
  );
}
