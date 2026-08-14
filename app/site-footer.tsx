"use client";

import { useLanguage } from "./language-context";

const SITE_REVISION = "Rev. 2026.08.14.1";

const REVISION_ENTRIES = [
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
