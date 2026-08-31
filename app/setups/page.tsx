"use client";

import Image from "next/image";
import { SiteFooter } from "../site-footer";
import { SiteHeader } from "../site-header";
import { useLanguage } from "../language-context";
import { SETUP_LIBRARY } from "./setup-library";

export default function SetupLibraryPage() {
  const { language, t } = useLanguage();

  return (
    <main className="app-shell">
      <SiteHeader active="setups" />
      <div id="top" className="page-content setup-library-page">
        <header className="setup-library-hero">
          <p className="eyebrow"><span className="eyebrow-line" />CHARLIE A+ SETUP LIBRARY</p>
          <h1>{t("先看位置，再看型態", "Location first, pattern second")}</h1>
          <p>{t(
            "10 組可重複檢查的合成 H1 交易結構，依序拆解背景、觸發、停損移動、出場與失效條件。",
            "Ten reusable synthetic H1 structures that separate context, trigger, stop movement, exit, and invalidation.",
          )}</p>
          <div className="setup-library-notice">
            <strong>{t("教育用途", "Education only")}</strong>
            <span>{t(
              "全部價格均為特別設計的合成 OHLC；不是即時行情、回測成果、勝率聲明或投資建議。",
              "All prices are purpose-built synthetic OHLC data, not live quotes, backtest results, win-rate claims, or investment advice.",
            )}</span>
          </div>
        </header>

        <div className="setup-library-layout">
          <aside className="setup-library-index" aria-label={t("中英文型態索引", "Bilingual setup index")}>
            <p>型態索引 / SETUP INDEX</p>
            <nav>
              {SETUP_LIBRARY.map((setup) => (
                <a key={setup.id} href={`#${setup.id}`}>
                  <span>{String(setup.number).padStart(2, "0")} {setup.titleZh}</span>
                  <small>{setup.titleEn}</small>
                </a>
              ))}
            </nav>
          </aside>

          <div className="setup-library-list">
            {SETUP_LIBRARY.map((setup) => (
              <article className="setup-library-card" id={setup.id} key={setup.id}>
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

                <a className="setup-chart" href={`/setup-library/${setup.id}.svg`} target="_blank" rel="noreferrer" aria-label={t("開啟 SVG 向量圖", "Open SVG chart")}>
                  <Image
                    src={`/setup-library/${setup.id}.png`}
                    alt={`${setup.titleZh} / ${setup.titleEn}`}
                    width={2800}
                    height={1750}
                    unoptimized
                    sizes="(max-width: 760px) 100vw, (max-width: 1080px) 80vw, 980px"
                  />
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
              </article>
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
