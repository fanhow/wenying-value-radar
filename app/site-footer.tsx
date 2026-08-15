"use client";

import { useLanguage } from "./language-context";

const SITE_REVISION = "Rev. 2026.08.16.5";

const REVISION_ENTRIES = [
  ["2026.08.16.5", "水平支撐壓力需跨月至少兩次測試；過度接近的狹窄盤整線位不再強制繪製。", "Horizontal levels now require tests across at least two months, and compressed congestion levels are no longer forced onto the chart."],
  ["2026.08.16.4", "支撐壓力虛線加入日線、週線或月線來源；資料不足時不強制產生線位。", "Added daily, weekly, or monthly source labels to key levels and avoids forcing levels when evidence is insufficient."],
  ["2026.08.16.3", "修正主要壓力定義：壓力須高於現價，並優先採用近期日線高點與前支撐轉壓力的重疊區。", "Refined primary resistance to stay above price and prioritize zones where recent daily highs overlap former support."],
  ["2026.08.16.2", "加入觀察清單背景技術掃描、D1 提醒紀錄、即時檢查與站內通知中心。", "Added background watchlist scans, durable D1 alert history, on-demand checks, and an in-site alert center."],
  ["2026.08.16.1", "加入週月支撐壓力、早晨與黃昏之星、吞噬、錘子與流星線的分級技術提醒。", "Added staged technical alerts for weekly/monthly levels, morning/evening stars, engulfing, hammers, and shooting stars."],
  ["2026.08.15.3", "調整導覽順序與大標題標點，觀察清單加入同字級方向箭頭及個別移除功能。", "Reordered navigation, cleaned headline punctuation, and added equal-size direction arrows and per-item removal to the watchlist."],
  ["2026.08.15.2", "修復 Cloudflare Workers 型別檢查，市場情緒改用口語提示並加入台灣習慣的紅升綠跌方向箭頭。", "Fixed Cloudflare Workers type checking, simplified sentiment wording, and added Taiwan-style red-up and green-down direction arrows."],
  ["2026.08.15.1", "新增市場情緒頁、VIX 隱含波動率期限結構、風險提示與原始資金流研究來源。", "Added market sentiment, the VIX implied-volatility term structure, risk guidance, and original flow-research sources."],
  ["2026.08.14.1", "重排首頁研究段落，更新台股即時價格與漲停標示，加入規則式技術提示。", "Reordered research sections, refreshed Taiwan quotes and limit-up styling, and added rule-based technical signals."],
  ["2026.08.13.1", "方舟紀錄改為每日收合，加入站內改版記錄，移除公開模型說明頁籤。", "Grouped ARKER history by collapsible day, added site revisions, and removed the public method tab."],
  ["2026.08.13", "新增可跨頁保留的方舟運算長期紀錄。", "Added durable ARKER import history across visits."],
  ["2026.08.12", "改善公允價值排行、大戶共同持倉與日 K 線版面。", "Improved rankings, shared fund holdings, and daily chart layout."],
] as const;

export function SiteFooter({
  disclaimer,
  motto,
}: {
  disclaimer: readonly [string, string];
  motto: readonly [string, string];
}) {
  const { language, t } = useLanguage();

  return (
    <footer className="footer">
      <div>
        <span>穩盈價值雷達 · WenYing Value Radar</span>
        <small>{t(disclaimer[0], disclaimer[1])}</small>
        <details className="revision-log">
          <summary>{SITE_REVISION} · {t("改版記錄", "Revisions")}</summary>
          <ul>
            {REVISION_ENTRIES.map(([revision, zh, en]) => <li key={revision}><b>{revision}</b>{language === "zh" ? zh : en}</li>)}
          </ul>
        </details>
      </div>
      <span>{t(motto[0], motto[1])}</span>
    </footer>
  );
}
