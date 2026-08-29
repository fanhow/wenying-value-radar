"use client";

import { useEffect, useState } from "react";
import type { UsEarningsReport } from "../lib/us-earnings";
import type { Language } from "./language-context";

type UsEarningsPanelProps = {
  ticker: string;
  initialReport?: UsEarningsReport;
  language: Language;
};

export function UsEarningsPanel({ ticker, initialReport, language }: UsEarningsPanelProps) {
  const [fetched, setFetched] = useState<{ ticker: string; report: UsEarningsReport | null } | null>(null);
  const initial = initialReport?.ticker === ticker ? initialReport : null;
  const report = initial ?? (fetched?.ticker === ticker ? fetched.report : null);
  const isLoading = !initial && fetched?.ticker !== ticker;

  useEffect(() => {
    if (initialReport?.ticker === ticker) return;

    let isMounted = true;
    fetch(`/api/earnings?ticker=${encodeURIComponent(ticker)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UsEarningsReport | null) => {
        if (isMounted) setFetched({ ticker, report: data });
      })
      .catch(() => {
        if (isMounted) setFetched({ ticker, report: null });
      });

    return () => {
      isMounted = false;
    };
  }, [ticker, initialReport]);

  if (isLoading) {
    return (
      <div className="earnings-panel panel loading">
        <div className="earnings-loading-text">
          <span className="pulse-dot" />
          <span>{language === "zh" ? "正在同步最新美股財報日與市場分析師預估…" : "Syncing latest U.S. earnings calendar and consensus estimates…"}</span>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const isImminent = report.urgencyLevel === "imminent";
  const isUpcoming = report.urgencyLevel === "upcoming";

  const bannerClass = isImminent
    ? "earnings-alert-banner imminent"
    : isUpcoming
      ? "earnings-alert-banner upcoming"
      : "earnings-alert-banner scheduled";

  const badgeText = report.countdownDays === 0
    ? (language === "zh" ? `🚨 今日公佈 (${report.earningsTimeLabelZh})` : `🚨 Reporting Today (${report.earningsTimeLabelEn})`)
    : report.countdownDays !== null && report.countdownDays > 0 && report.countdownDays <= 7
      ? (language === "zh" ? `⚡ 倒數 ${report.countdownDays} 天 (${report.earningsTimeLabelZh})` : `⚡ In ${report.countdownDays} Days (${report.earningsTimeLabelEn})`)
      : report.isDateConfirmed
        ? (language === "zh" ? `📅 已排定 ${report.earningsDate}` : `📅 Scheduled ${report.earningsDate}`)
        : (language === "zh" ? `⏳ 預估期 ${report.fiscalQuarter}` : `⏳ Est. Window ${report.fiscalQuarter}`);

  return (
    <div className="earnings-panel panel" aria-label={language === "zh" ? "美股財報日與市場預期" : "U.S. Earnings Date & Market Expectations"}>
      <div className={bannerClass}>
        <div className="earnings-alert-header">
          <div className="earnings-alert-title-row">
            <span className="earnings-urgency-badge">{badgeText}</span>
            <h4>{language === "zh" ? report.alertTitleZh : report.alertTitleEn}</h4>
          </div>
          <span className="earnings-source-tag">{report.source}</span>
        </div>
        <p className="earnings-alert-note">{language === "zh" ? report.alertNoteZh : report.alertNoteEn}</p>
      </div>

      <div className="earnings-expectations-section">
        <div className="earnings-section-title">
          <h5>{language === "zh" ? "📊 本季市場預期與分析師共識" : "📊 Consensus Expectations & Analyst Estimates"}</h5>
          <span>{language === "zh" ? `財報季度：${report.fiscalQuarter}` : `Fiscal Quarter: ${report.fiscalQuarter}`}</span>
        </div>

        <div className="earnings-grid">
          <div className="earnings-metric-card primary-card">
            <span className="metric-label">{language === "zh" ? "市場預估 EPS (Consensus)" : "Consensus EPS"}</span>
            <div className="metric-value-row">
              <strong className="metric-highlight">
                {report.consensusEps !== null ? `$${report.consensusEps.toFixed(2)}` : "—"}
              </strong>
              {report.yoyEpsGrowth !== null && (
                <span className={`yoy-tag ${report.yoyEpsGrowth >= 0 ? "positive" : "negative"}`}>
                  {report.yoyEpsGrowth >= 0 ? "+" : ""}{report.yoyEpsGrowth.toFixed(1)}% YoY
                </span>
              )}
            </div>
            <small className="metric-subtext">
              {report.lastYearEps !== null
                ? (language === "zh" ? `去年同期 EPS $${report.lastYearEps.toFixed(2)}` : `Prior Year EPS $${report.lastYearEps.toFixed(2)}`)
                : (language === "zh" ? "官方申報歷史" : "Historical SEC filings")}
            </small>
          </div>

          <div className="earnings-metric-card">
            <span className="metric-label">{language === "zh" ? "分析師預估區間 (Range)" : "Estimate Range"}</span>
            <strong className="metric-main">
              {report.lowEps !== null && report.highEps !== null
                ? `$${report.lowEps.toFixed(2)} ~ $${report.highEps.toFixed(2)}`
                : "—"}
            </strong>
            <small className="metric-subtext">
              {report.analystCount
                ? (language === "zh" ? `共 ${report.analystCount} 位分析師評估` : `Based on ${report.analystCount} analysts`)
                : (language === "zh" ? "華爾街機構評估" : "Wall Street estimates")}
            </small>
          </div>

          <div className="earnings-metric-card">
            <span className="metric-label">{language === "zh" ? "歷史超預期勝率 (Beat Rate)" : "Historical Beat Rate"}</span>
            <strong className="metric-main">
              {report.beatRatePercent !== null ? `${report.beatRatePercent}%` : "—"}
            </strong>
            <small className="metric-subtext">
              {report.avgSurprisePercent !== null
                ? (language === "zh" ? `近 4 季平均超預期 ${report.avgSurprisePercent >= 0 ? "+" : ""}${report.avgSurprisePercent}%` : `Avg 4Q surprise ${report.avgSurprisePercent >= 0 ? "+" : ""}${report.avgSurprisePercent}%`)
                : (language === "zh" ? "近 4 季財報追蹤" : "Last 4 quarters track record")}
            </small>
          </div>

          <div className="earnings-metric-card">
            <span className="metric-label">{language === "zh" ? "近期預估修訂動能 (Revisions)" : "Estimate Revisions (4W)"}</span>
            <strong className="metric-main revisions-value">
              <span className="rev-up">↑ {report.revisionsUp ?? 0}</span>
              <span className="rev-slash">/</span>
              <span className="rev-down">↓ {report.revisionsDown ?? 0}</span>
            </strong>
            <small className="metric-subtext">
              {language === "zh" ? "過去 4 週上修 / 下修家數" : "Upward / Downward revisions in 4 weeks"}
            </small>
          </div>
        </div>

        {report.historicalQuarters && report.historicalQuarters.length > 0 && (
          <div className="historical-quarters-row">
            <span className="history-label">{language === "zh" ? "近 4 季歷史超預期紀錄：" : "Past 4Q Beat Record:"}</span>
            <div className="history-chips">
              {report.historicalQuarters.map((q) => (
                <span key={q.period} className={`history-chip ${q.isBeat ? "beat" : "miss"}`} title={`Consensus: $${q.consensus} | Actual: $${q.actual}`}>
                  <b>{q.period}</b>: {q.actual >= q.consensus ? "Beat" : "Miss"} ({q.surprisePercent >= 0 ? "+" : ""}{q.surprisePercent}%)
                </span>
              ))}
            </div>
          </div>
        )}

        {(report.upcomingQuarters.length > 1 || report.fiscalYearForecast.length > 0) && (
          <div className="earnings-outlook-row">
            {report.upcomingQuarters.length > 1 && (
              <div className="outlook-group">
                <span className="outlook-title">{language === "zh" ? "未來季度 EPS 預期：" : "Upcoming Quarters EPS:"}</span>
                <div className="outlook-chips">
                  {report.upcomingQuarters.slice(1, 4).map((q) => (
                    <span key={q.period} className="outlook-chip">
                      <strong>{q.period}</strong>: ${q.consensus.toFixed(2)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {report.fiscalYearForecast.length > 0 && (
              <div className="outlook-group">
                <span className="outlook-title">{language === "zh" ? "全年度 EPS 展望：" : "Full Year EPS Forecast:"}</span>
                <div className="outlook-chips">
                  {report.fiscalYearForecast.slice(0, 2).map((y) => (
                    <span key={y.fiscalEnd} className="outlook-chip fy">
                      <strong>{y.fiscalEnd}</strong>: ${y.consensus.toFixed(2)}{y.analystCount ? ` (${y.analystCount}人)` : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
