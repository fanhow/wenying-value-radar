"use client";

import Link from "next/link";
import { useLanguage } from "./language-context";

export function SiteHeader({ active }: { active: "home" | "funds" | "ark" | "about" | "sentiment" }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label={t("穩盈價值雷達首頁", "WenYing Value Radar home")}>
        <span className="brand-mark">WY</span>
        <strong>{t("穩盈 - 價值雷達", "WenYing - Value Radar")}</strong>
      </Link>
      <nav className="topnav" aria-label={t("主要導覽", "Primary navigation")}>
        <Link className={active === "home" ? "active" : ""} href="/#overview">{t("公允價值", "Fair Value")}</Link>
        <Link className={active === "funds" ? "active" : ""} href="/funds">{t("大戶追蹤", "Fund Tracker")}</Link>
        <Link className={active === "ark" ? "active" : ""} href="/ark">{t("方舟運算", "ARK Tool")}</Link>
        <Link href="/#watchlist">{t("我的觀察", "Watchlist")}</Link>
        <Link className={active === "sentiment" ? "active" : ""} href="/sentiment">{t("市場情緒", "Sentiment")}</Link>
        <Link className={active === "about" ? "active" : ""} href="/about">{t("關於我們", "About Us")}</Link>
      </nav>
      <div className="header-controls">
        <div className="workspace-badge"><span className="status-dot" />{t("穩盈基金", "WenYing Fund")} <span className="workspace-lock">{t("研究工具", "RESEARCH")}</span></div>
        <div className="language-switch" role="group" aria-label={t("語言選擇", "Language selection")}>
          <button type="button" className={language === "zh" ? "active" : ""} onClick={() => setLanguage("zh")} aria-pressed={language === "zh"}>中</button>
          <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} aria-pressed={language === "en"}>EN</button>
        </div>
      </div>
      <nav className="mobile-nav" aria-label={t("手機版導覽", "Mobile navigation")}>
        <Link className={active === "home" ? "active" : ""} href="/#overview">{t("公允價值", "Fair Value")}</Link>
        <Link className={active === "funds" ? "active" : ""} href="/funds">{t("大戶追蹤", "Funds")}</Link>
        <Link className={active === "ark" ? "active" : ""} href="/ark">{t("方舟運算", "ARK")}</Link>
        <Link className={active === "sentiment" ? "active" : ""} href="/sentiment">{t("市場情緒", "Sentiment")}</Link>
        <Link className={active === "about" ? "active" : ""} href="/about">{t("關於我們", "About")}</Link>
      </nav>
    </header>
  );
}
