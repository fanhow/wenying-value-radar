"use client";

import Link from "next/link";
import { SiteHeader } from "../site-header";
import { useLanguage } from "../language-context";
import { SiteFooter } from "../site-footer";

export default function AboutPage() {
  const { t } = useLanguage();

  return (
    <main className="app-shell">
      <SiteHeader active="about" />
      <div id="top" className="page-content about-page">
        <header className="about-page-heading">
          <p className="eyebrow"><span className="eyebrow-line" />ABOUT WENYING</p>
          <h1>{t("認識穩盈", "Meet WenYing")}<br /><em>{t("理解我們如何做選擇", "and how we make decisions")}</em></h1>
          <p>{t(
            "我們相信，能長久執行的投資方法，必須建立在資料、紀律與可承受的風險之上。",
            "We believe an investment process can last only when it is built on evidence, discipline, and risk we can afford.",
          )}</p>
        </header>

        <section id="about" className="about-section about-page-section" aria-labelledby="about-title">
          <div className="about-statement">
            <p className="section-kicker">WHY WE STARTED / 01</p>
            <h2 id="about-title">{t("我們不是賭徒", "We are not gamblers")}<br /><em>{t("投資，是有依據的選擇", "Investing is an evidence-based choice")}</em></h2>
            <p>{t(
              "穩盈基金成立的初衷，是用有紀律、可驗證的方法管理共同資金。比起追逐短線刺激，我們更重視看得懂的機會、承受得起的風險，以及能夠長久執行的決策。",
              "WenYing Fund was created to manage shared capital with a disciplined, verifiable process. Instead of chasing short-term excitement, we focus on understandable opportunities, affordable risks, and decisions that can be sustained over time.",
            )}</p>
            <div className="about-motto"><span>{t("穩", "S")}</span><strong>{t("先守住風險", "Protect the downside")}</strong><i /> <span>{t("盈", "G")}</span><strong>{t("再追求成長", "Then pursue growth")}</strong></div>
          </div>
          <div className="principle-grid">
            <article><span>01</span><div><h3>{t("投資，不是下注", "Investing is not betting")}</h3><p>{t("每一次決策，都以資料、估值與可承受的風險為基礎，不因情緒追高殺低。", "Every decision starts with evidence, valuation, and tolerable risk—not emotion or momentum chasing.")}</p></div></article>
            <article><span>02</span><div><h3>{t("多重方法驗證", "Validate from multiple angles")}</h3><p>{t("用方舟運算尋找機會，以日本蠟燭圖判讀節奏，再用公允價值確認安全邊際。", "We use ARKER to find opportunities, candlestick analysis to read timing, and fair value to confirm the margin of safety.")}</p></div></article>
            <article><span>03</span><div><h3>{t("風險放在報酬之前", "Risk comes before return")}</h3><p>{t("先決定能承受多少損失，再決定投入多少資金；保留調整空間，不孤注一擲。", "We define an acceptable loss before sizing a position, keeping room to adjust instead of betting everything at once.")}</p></div></article>
            <article><span>04</span><div><h3>{t("順勢選擇優質標的", "Follow trends, choose quality")}</h3><p>{t("尊重市場方向，在合適的趨勢中選擇基本面良好、具成長潛力的股票與基金。", "We respect market direction and select fundamentally sound stocks and funds with growth potential when the trend is supportive.")}</p></div></article>
          </div>
        </section>

        <section className="about-bridge">
          <div><p className="section-kicker">FROM PRINCIPLE TO PRACTICE / 02</p><h2>{t("理念必須能落地", "Principles must become practice")}<br /><em>{t("資料才能形成決策", "and data must become decisions")}</em></h2></div>
          <div className="about-bridge-copy"><p>{t("穩盈價值雷達把這套理念轉成可以重複使用的研究流程：先驗證資料，再衡量公允價值與風險，最後才決定是否值得進一步研究。", "WenYing Value Radar turns these principles into a repeatable research process: validate the data, measure fair value and risk, and only then decide whether an idea deserves deeper research.")}</p><Link href="/#overview">{t("前往公允價值首頁", "Open the Fair Value dashboard")} <span>→</span></Link></div>
        </section>

        <SiteFooter disclaimer={["本網站僅供投資研究與教育用途，不構成投資建議。", "This website is for investment research and education only and does not constitute investment advice."]} motto={["先守住風險，再追求成長", "Protect the downside, then pursue growth"]} />
      </div>
    </main>
  );
}
