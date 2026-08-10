"use client";

import Link from "next/link";
import { useLanguage } from "./language-context";

export function SiteHeader({ active }: { active: "home" | "about" }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label={t("穩盈價值雷達首頁", "WenYing Value Radar home")}>
        <span className="brand-mark">WY</span>
        <span>
          <strong>{t("穩盈", "WenYing")}</strong>
          <small>{t("價值雷達", "Value Radar")}</small>
        </span>
      </Link>
      <nav className="topnav" aria-label={t("主要導覽", "Primary navigation")}>
        <Link className={active === "home" ? "active" : ""} href="/#overview">{t("公允價值", "Fair Value")}</Link>
        <Link href="/#ark-import">{t("方舟匯入", "ARK Import")}</Link>
        <Link href="/#watchlist">{t("我的觀察", "Watchlist")}</Link>
        <Link href="/#method">{t("模型說明", "Method")}</Link>
        <Link className={active === "about" ? "active" : ""} href="/about">{t("關於我們", "About Us")}</Link>
      </nav>
      <div className="header-controls">
        <div className="workspace-badge"><span className="status-dot" />{t("穩盈基金", "WenYing Fund")} <span className="workspace-lock">{t("研究工具", "RESEARCH")}</span></div>
        <div className="language-switch" role="group" aria-label={t("語言選擇", "Language selection")}>
          <button type="button" className={language === "zh" ? "active" : ""} onClick={() => setLanguage("zh")} aria-pressed={language === "zh"}>中</button>
          <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} aria-pressed={language === "en"}>EN</button>
        </div>
      </div>
    </header>
  );
}
