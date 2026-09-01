"use client";

import { SiteFooter } from "../site-footer";
import { SiteHeader } from "../site-header";
import { useLanguage } from "../language-context";
import { realCasesForSetup } from "./real-market-cases";
import { SetupLibraryCard } from "./setup-library-card";
import { SETUP_LIBRARY } from "./setup-library";

export default function SetupLibraryPage() {
  const { t } = useLanguage();
  const realCaseDirectory = SETUP_LIBRARY.flatMap((setup) =>
    realCasesForSetup(setup.id).map((marketCase) => ({ setup, marketCase })),
  );

  return (
    <main className="app-shell">
      <SiteHeader active="setups" />
      <div id="top" className="page-content setup-library-page">
        <header className="setup-library-hero">
          <p className="eyebrow"><span className="eyebrow-line" />CHARLIE A+ SETUP LIBRARY</p>
          <h1>{t("先看位置，再看型態", "Location first, pattern second")}</h1>
          <p>{t(
            "10 組可重複檢查的理想合成 H1 結構，並加入可持續累積的真實市場案例，對照背景、執行、風險管理與復盤。",
            "Ten reusable ideal synthetic H1 structures with an extensible real-market case layer for context, execution, risk management, and review.",
          )}</p>
          <div className="setup-library-notice">
            <strong>{t("教育用途", "Education only")}</strong>
            <span>{t(
              "理想模型使用特別設計的合成 OHLC；真實案例只呈現可驗證資料，未知價格、日期與績效一律留白。這不是即時行情、勝率聲明或投資建議。",
              "Ideal models use purpose-built synthetic OHLC. Real cases show only verifiable evidence, leaving unknown prices, dates, and performance blank. This is not live data, a win-rate claim, or investment advice.",
            )}</span>
          </div>
          <nav className="setup-real-case-directory" aria-label={t("真實案例快速入口", "Real-market case shortcuts")}>
            <strong>{t("真實案例", "REAL MARKET CASES")}</strong>
            {realCaseDirectory.map(({ setup, marketCase }) => (
              <a href={`#${setup.id}`} key={marketCase.id}>
                <span>{marketCase.symbol} · {marketCase.execution_timeframe}</span>
                <small>{t(setup.titleZh, setup.titleEn)}</small>
              </a>
            ))}
          </nav>
        </header>

        <div className="setup-library-layout">
          <aside className="setup-library-index" aria-label={t("中英文型態索引", "Bilingual setup index")}>
            <p>型態索引 / SETUP INDEX</p>
            <nav>
              {SETUP_LIBRARY.map((setup) => (
                <a key={setup.id} href={`#${setup.id}`}>
                  <span>{String(setup.number).padStart(2, "0")} {setup.titleZh}</span>
                  <small>{setup.titleEn}{realCasesForSetup(setup.id).length ? ` · REAL ${realCasesForSetup(setup.id).length}` : ""}</small>
                </a>
              ))}
            </nav>
          </aside>

          <div className="setup-library-list">
            {SETUP_LIBRARY.map((setup) => (
              <SetupLibraryCard setup={setup} cases={realCasesForSetup(setup.id)} key={setup.id} />
            ))}
          </div>
        </div>

        <SiteFooter
          disclaimer={["本圖庫僅供交易結構教育，不構成投資建議。", "This library is for trading-structure education only and does not constitute investment advice."]}
          motto={["位置優先，型態其次", "Location first, pattern second"]}
        />
      </div>
    </main>
  );
}
