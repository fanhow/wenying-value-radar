"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { calculateStock, clamp, type Market, type Stock, type StockInput } from "../lib/valuation";
import { findStockDirectoryEntries, safeLookupError } from "../lib/stock-directory";
import { useLanguage, type Language } from "./language-context";
import { SiteHeader } from "./site-header";

type Filter = "all" | "undervalued" | "overvalued" | "quality" | "risk";
type SortKey = "upside" | "quality" | "price";

type RemoteSymbol = {
  ticker: string;
  market: Market;
  name: string;
};

type MarketScanResponse = {
  scannedCount?: number;
  scannedByMarket?: { TW?: number; US?: number };
  candidates?: StockInput[];
  overvaluedCandidates?: StockInput[];
};

type ValuationCandidate = {
  ticker: string;
  market: Market;
  capturedPrice?: number;
  capturedNav?: number;
  capturedName?: string;
};

const seedInputs: StockInput[] = [];

const numberFormatter = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 2,
});

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatPrice(value: number, market: Market) {
  return market === "TW" ? `NT$ ${numberFormatter.format(value)}` : `US$ ${numberFormatter.format(value)}`;
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function RiskPill({ risk, language }: { risk: Stock["risk"]; language: Language }) {
  const englishRisk = risk === "低" ? "Low" : risk === "中" ? "Medium" : "High";
  return <span className={`risk-pill risk-${risk === "低" ? "low" : risk === "中" ? "medium" : "high"}`}>{language === "zh" ? `${risk}風險` : `${englishRisk} Risk`}</span>;
}

function TrendMark({ positive }: { positive: boolean }) {
  return <span className={`trend-mark ${positive ? "positive" : "negative"}`}>{positive ? "↗" : "↘"}</span>;
}

function translateModelLabel(label: string) {
  return ({
    "本益比法": "P/E Method",
    "股價淨值比法": "P/B Method",
    "自由現金流倍數法": "FCF Multiple Method",
    "折現現金流法": "Discounted Cash Flow",
    "盈餘能力價值法": "Earnings Power Value",
    "Graham 防禦估值": "Graham Defensive Value",
    "股利折現法": "Dividend Discount Model",
    "即時淨值法": "iNAV Method",
  } as Record<string, string>)[label] ?? label;
}

function englishModelExplanation(label: string, stock: Stock) {
  if (label === "本益比法") return `EPS ${formatNumber(stock.eps)} × target P/E ${formatNumber(stock.targetPe)}`;
  if (label === "股價淨值比法") return `Book value/share ${formatNumber(stock.bvps)} × target P/B ${formatNumber(stock.targetPb)}`;
  if (label === "自由現金流倍數法") return `FCF/share ${formatNumber(stock.fcfPerShare)} × FCF multiple ${formatNumber(stock.targetFcfMultiple)}`;
  if (label === "折現現金流法") return `Five-year FCF discounted at ${formatNumber((stock.discountRate ?? 0) * 100)}%, with ${formatNumber((stock.terminalGrowth ?? 0) * 100)}% terminal growth`;
  if (label === "盈餘能力價值法") return `Normalized EPS ${formatNumber(stock.eps)} ÷ required return ${formatNumber((stock.discountRate ?? 0) * 100)}%`;
  if (label === "Graham 防禦估值") return `√(22.5 × EPS ${formatNumber(stock.eps)} × book value/share ${formatNumber(stock.bvps)})`;
  if (label === "股利折現法") return `Dividend/share ${formatNumber(stock.dividendPerShare ?? 0)} discounted as a stable-growth stream`;
  return "Uses the iNAV captured from the ARKER screenshot";
}

export default function Home() {
  const { language, t } = useLanguage();
  const [stockInputs, setStockInputs] = useState<StockInput[]>(seedInputs);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("undervalued");
  const [sortKey, setSortKey] = useState<SortKey>("upside");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isSuggestionLoading, setIsSuggestionLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [remoteSymbols, setRemoteSymbols] = useState<RemoteSymbol[]>([]);
  const [marketCandidates, setMarketCandidates] = useState<StockInput[]>([]);
  const [overvaluedCandidates, setOvervaluedCandidates] = useState<StockInput[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [scannedByMarket, setScannedByMarket] = useState({ TW: 0, US: 0 });
  const [isMarketScanLoading, setIsMarketScanLoading] = useState(true);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [form, setForm] = useState({
    ticker: "",
    name: "",
    market: "TW" as Market,
    sector: "",
    price: "",
    eps: "",
    bvps: "",
    fcfPerShare: "",
    targetPe: "18",
    targetPb: "1.8",
    targetFcfMultiple: "18",
    revenueGrowth: "8",
    roe: "10",
    debtRatio: "40",
    uncertainty: "22",
  });

  useEffect(() => {
    let savedStocks: StockInput[] = [];
    let savedWatchlist: string[] = [];
    try {
      savedStocks = JSON.parse(
        localStorage.getItem("wenying-value-radar-stocks-v1")
          || localStorage.getItem("stable-value-stocks-v1")
          || "[]",
      ) as StockInput[];
      savedWatchlist = JSON.parse(
        localStorage.getItem("wenying-value-radar-watchlist-v1")
          || localStorage.getItem("stable-value-watchlist-v1")
          || "[]",
      ) as string[];
    } catch {
      localStorage.removeItem("wenying-value-radar-stocks-v1");
      localStorage.removeItem("wenying-value-radar-watchlist-v1");
    }
    const timer = window.setTimeout(() => {
      if (Array.isArray(savedStocks)) setStockInputs(savedStocks);
      if (Array.isArray(savedWatchlist)) setWatchlist(savedWatchlist);
      if (savedStocks[0]?.ticker) setSelectedTicker(savedStocks[0].ticker);
      setHasLoadedStorage(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSuggestionLoading(true);
      try {
        const response = await fetch(`/api/symbols?q=${encodeURIComponent(normalized)}`, { signal: controller.signal });
        const payload = await response.json() as { symbols?: RemoteSymbol[] };
        if (response.ok) setRemoteSymbols(Array.isArray(payload.symbols) ? payload.symbols : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRemoteSymbols([]);
      } finally {
        if (!controller.signal.aborted) setIsSuggestionLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (hasLoadedStorage) localStorage.setItem("wenying-value-radar-stocks-v1", JSON.stringify(stockInputs));
  }, [hasLoadedStorage, stockInputs]);

  useEffect(() => {
    if (hasLoadedStorage) localStorage.setItem("wenying-value-radar-watchlist-v1", JSON.stringify(watchlist));
  }, [hasLoadedStorage, watchlist]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("stock-search")?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadMarketCandidates() {
      try {
        const response = await fetch("/api/market-scan", { signal: controller.signal });
        const payload = await response.json() as MarketScanResponse;
        if (!response.ok) throw new Error("market scan failed");
        setMarketCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
        setOvervaluedCandidates(Array.isArray(payload.overvaluedCandidates) ? payload.overvaluedCandidates : []);
        setScannedCount(Number(payload.scannedCount) || 0);
        setScannedByMarket({ TW: Number(payload.scannedByMarket?.TW) || 0, US: Number(payload.scannedByMarket?.US) || 0 });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMarketCandidates([]);
          setOvervaluedCandidates([]);
          setScannedCount(0);
          setScannedByMarket({ TW: 0, US: 0 });
        }
      } finally {
        if (!controller.signal.aborted) setIsMarketScanLoading(false);
      }
    }
    void loadMarketCandidates();
    return () => controller.abort();
  }, []);

  const stocks = useMemo(() => {
    const loadedTickers = new Set(stockInputs.map((stock) => stock.ticker));
    const scanInputs = [...marketCandidates, ...overvaluedCandidates];
    return [...scanInputs.filter((stock) => !loadedTickers.has(stock.ticker)), ...stockInputs]
      .map((stock) => calculateStock(stock, formatNumber));
  }, [marketCandidates, overvaluedCandidates, stockInputs]);
  const rankingStocks = useMemo(
    () => marketCandidates.map((stock) => calculateStock(stock, formatNumber)),
    [marketCandidates],
  );
  const overvaluedRankingStocks = useMemo(
    () => overvaluedCandidates.map((stock) => calculateStock(stock, formatNumber)),
    [overvaluedCandidates],
  );
  const selected = stocks.find((stock) => stock.ticker === selectedTicker) ?? stocks[0];

  const filteredStocks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sourceStocks = filter === "undervalued"
      ? rankingStocks
      : filter === "overvalued"
        ? overvaluedRankingStocks
        : stocks;
    const filtered = sourceStocks.filter((stock) => {
      const matchesQuery =
        !normalizedQuery ||
        stock.ticker.toLowerCase().includes(normalizedQuery) ||
        stock.name.toLowerCase().includes(normalizedQuery) ||
        stock.sector.toLowerCase().includes(normalizedQuery);
      const matchesFilter =
        filter === "all" ||
        (filter === "undervalued" && stock.upside >= 0.1) ||
        (filter === "overvalued" && stock.upside <= -0.1) ||
        (filter === "quality" && stock.qualityAvailable !== false && stock.qualityScore >= 75) ||
        (filter === "risk" && stock.risk === "高");
      return matchesQuery && matchesFilter;
    });
    return [...filtered].sort((a, b) => {
      if (sortKey === "quality") return b.qualityScore - a.qualityScore;
      if (sortKey === "price") return b.price - a.price;
      if (filter === "overvalued") return a.upside - b.upside;
      return b.upside - a.upside;
    });
  }, [filter, overvaluedRankingStocks, query, rankingStocks, sortKey, stocks]);

  const watchlistStocks = stocks.filter((stock) => watchlist.includes(stock.ticker));
  const undervaluedCount = rankingStocks.length;
  const overvaluedCount = overvaluedRankingStocks.length;
  const displayedUniverseCount = filter === "undervalued"
    ? rankingStocks.length
    : filter === "overvalued"
      ? overvaluedRankingStocks.length
      : stocks.length;
  const exactMatch = stocks.find((stock) => stock.ticker.toLowerCase() === query.trim().toLowerCase());
  const searchSuggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const loaded = stocks
      .filter((stock) => stock.ticker.toLowerCase().includes(normalizedQuery)
        || stock.name.toLowerCase().includes(normalizedQuery))
      .map((stock) => ({
        ticker: stock.ticker,
        market: stock.market,
        name: stock.name,
        upside: stock.upside,
        isLoaded: true,
      }));
    const directory = findStockDirectoryEntries(query)
      .filter((entry) => !loaded.some((stock) => stock.ticker === entry.ticker))
      .map((entry) => ({
        ticker: entry.ticker,
        market: entry.market,
        name: language === "zh" ? entry.nameZh : entry.nameEn,
        upside: null,
        isLoaded: false,
      }));
    const remote = remoteSymbols
      .filter((entry) => !loaded.some((stock) => stock.ticker === entry.ticker)
        && !directory.some((stock) => stock.ticker === entry.ticker))
      .map((entry) => ({ ...entry, upside: null, isLoaded: false }));

    return [...loaded, ...directory, ...remote].slice(0, 4);
  }, [language, query, remoteSymbols, stocks]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setLookupError("");
    setRemoteSymbols([]);
    const match = stocks.find((stock) => stock.ticker.toLowerCase() === value.trim().toLowerCase());
    if (match) setSelectedTicker(match.ticker);
  }

  function selectStock(ticker: string) {
    setSelectedTicker(ticker);
    setQuery("");
    window.setTimeout(() => document.getElementById("valuation-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function toggleWatchlist(ticker: string) {
    setWatchlist((current) => (current.includes(ticker) ? current.filter((item) => item !== ticker) : [...current, ticker]));
  }

  async function requestValuation(candidate: ValuationCandidate) {
    const response = await fetch("/api/valuation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    });
    const payload = await response.json() as { stock?: StockInput; error?: string };
    if (!response.ok || !payload.stock) throw new Error(payload.error || "暫時無法建立估值");
    return payload.stock;
  }

  async function lookupTicker(value = query, forceRefresh = false) {
    const ticker = value.trim().toUpperCase();
    if (!ticker) return;
    const local = stocks.find((stock) => stock.ticker === ticker);
    if (local && !forceRefresh) {
      selectStock(local.ticker);
      return;
    }
    setIsLookupLoading(true);
    setLookupError("");
    try {
      const stock = await requestValuation({ ticker, market: /^\d/.test(ticker) ? "TW" : "US" });
      setStockInputs((current) => [...current.filter((item) => item.ticker !== stock.ticker), stock]);
      setWatchlist((current) => current.includes(stock.ticker) ? current : [...current, stock.ticker]);
      setSelectedTicker(stock.ticker);
      setQuery(stock.ticker);
      window.setTimeout(() => document.getElementById("valuation-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } catch (error) {
      setLookupError(safeLookupError(error instanceof Error ? error.message : "", language));
    } finally {
      setIsLookupLoading(false);
    }
  }

  function updateForm(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addCustomStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ticker = form.ticker.trim().toUpperCase();
    const price = Number(form.price);
    const eps = Number(form.eps);
    const bvps = Number(form.bvps);
    const fcfPerShare = Number(form.fcfPerShare);
    if (!ticker || !form.name.trim() || price <= 0 || (!eps && !bvps && !fcfPerShare)) return;

    const newInput: StockInput = {
      ticker,
      name: form.name.trim(),
      market: form.market,
      sector: form.sector.trim() || "未分類",
      price,
      eps,
      bvps,
      fcfPerShare,
      targetPe: Number(form.targetPe) || 18,
      targetPb: Number(form.targetPb) || 1.8,
      targetFcfMultiple: Number(form.targetFcfMultiple) || 18,
      revenueGrowth: Number(form.revenueGrowth) || 0,
      roe: Number(form.roe) || 0,
      debtRatio: Number(form.debtRatio) || 0,
      uncertainty: clamp((Number(form.uncertainty) || 22) / 100, 0.05, 0.6),
      updatedAt: "剛剛輸入",
      source: "手動輸入",
    };

    setStockInputs((current) => [...current.filter((stock) => stock.ticker !== ticker), newInput]);
    setSelectedTicker(ticker);
    setWatchlist((current) => (current.includes(ticker) ? current : [...current, ticker]));
    setQuery(ticker);
    setShowAddForm(false);
  }

  return (
    <main className="app-shell">
      <SiteHeader active="home" />

      <div id="top" className="page-content">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" />{t("公允價值研究首頁", "FAIR VALUE RESEARCH")} <span className="beta-tag">BETA</span></p>
            <h1 id="page-title">{t("看見價格，", "See the price,")}<br /><em>{t("也看見它與價值的距離。", "and the distance to value.")}</em></h1>
            <p className="hero-description">{t("搜尋台股與美股、匯入方舟名單，以透明模型比較目前價格、公允價值與上行空間。", "Search Taiwan and U.S. stocks or import an ARKER list, then compare market price, fair value, and potential upside through transparent models.")}</p>
            <div className="hero-principles" aria-label={t("公允價值研究重點", "Fair value research priorities")}>
              <span>{t("目前價格", "Market Price")}</span><span>{t("公允價值", "Fair Value")}</span><span>{t("安全邊際", "Margin of Safety")}</span>
            </div>
          </div>
          <div className="search-wrap">
            <label htmlFor="stock-search">{t("搜尋股票代碼或名稱", "Search by ticker or company name")}</label>
            <div className="search-box">
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input
                id="stock-search"
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const suggestion = searchSuggestions[0];
                    if (suggestion?.isLoaded) selectStock(suggestion.ticker);
                    else void lookupTicker(suggestion?.ticker ?? query);
                  }
                }}
                placeholder={t("輸入 2330、3508 或 AAPL", "Enter 2330, 3508, or AAPL")}
                autoComplete="off"
              />
              {query && <button className="clear-search" type="button" onClick={() => setQuery("")} aria-label={t("清除搜尋", "Clear search")}>×</button>}
              <kbd>⌘ K</kbd>
            </div>
            <div className="search-hints">
              <span>{t("快速查看", "Quick access")}</span>
              {watchlist.slice(0, 4).map((ticker) => <button key={ticker} type="button" onClick={() => selectStock(ticker)}>{ticker}</button>)}
            </div>
            {query && !exactMatch && searchSuggestions.length > 0 && (
              <div className="search-results-popover">
                {searchSuggestions.map((suggestion) => (
                  <button type="button" key={suggestion.ticker} onClick={() => suggestion.isLoaded ? selectStock(suggestion.ticker) : void lookupTicker(suggestion.ticker)}>
                    <span><strong>{suggestion.ticker}</strong> <span className="suggestion-name">{suggestion.name}</span></span>
                    {suggestion.upside === null
                      ? <span className="suggestion-market">{suggestion.market === "TW" ? t("台股", "Taiwan") : t("美股", "U.S.")}</span>
                      : <span className={suggestion.upside >= 0 ? "text-positive" : "text-negative"}>{formatSignedPercent(suggestion.upside)}</span>}
                  </button>
                ))}
              </div>
            )}
            {query && !exactMatch && searchSuggestions.length === 0 && isSuggestionLoading && (
              <div className="search-empty search-loading" aria-live="polite">
                <span>{t("正在查詢股票名稱…", "Looking up the company name…")}</span>
              </div>
            )}
            {query && !exactMatch && searchSuggestions.length === 0 && !isSuggestionLoading && (
              <div className="search-empty">
                <span>{lookupError || t(`尚未收錄「${query}」`, `“${query}” is not in your list yet`)}</span>
                <button type="button" disabled={isLookupLoading} onClick={() => void lookupTicker()}>{isLookupLoading ? t("查詢中…", "Searching…") : t("查詢公開資料 →", "Search public data →")}</button>
              </div>
            )}
          </div>
        </section>

        <section className="main-grid">
          <div className="table-panel panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">MARKET SCAN / 04</p>
                <h2>{t("公允價值排行榜", "Fair Value Ranking")}</h2>
                <p className="panel-subtitle">{t("低估與高估候選皆提供台股前 20＋美股前 20，作為多空研究起點", "Both screens show the top 20 Taiwan and top 20 U.S. stocks as a starting point for long and short research")}</p>
              </div>
              <div className="sort-control">
                <label htmlFor="sort">{t("排序", "Sort")}</label>
                <select id="sort" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                  <option value="upside">{t("上行空間", "Upside")}</option>
                  <option value="quality">{t("品質分數", "Quality score")}</option>
                  <option value="price">{t("現價", "Current price")}</option>
                </select>
              </div>
            </div>
            <div className="filter-tabs" role="tablist" aria-label={t("股票篩選", "Stock filters")}>
              {([["all", t("全部", "All")], ["undervalued", t("低估候選 40", "Top 40 Undervalued")], ["overvalued", t("高估候選 40", "Top 40 Overvalued")], ["quality", t("高品質", "High quality")], ["risk", t("高風險警示", "High risk")]] as [Filter, string][]).map(([key, label]) => (
                <button key={key} type="button" className={filter === key ? "selected" : ""} onClick={() => setFilter(key)} role="tab" aria-selected={filter === key}>{label}</button>
              ))}
            </div>
            <div className="stock-table-wrap">
              <table className="stock-table">
                <thead>
                  <tr><th scope="col">{t("標的", "Stock")}</th><th scope="col">{t("現價", "Price")}</th><th scope="col">{t("模型公允價值", "Fair Value")}</th><th scope="col">{t("上行空間", "Upside")}</th><th scope="col">{t("品質", "Quality")}</th><th scope="col">{t("風險", "Risk")}</th><th scope="col"><span className="sr-only">{t("操作", "Actions")}</span></th></tr>
                </thead>
                <tbody>
                  {filteredStocks.map((stock) => {
                    const isSelected = selected?.ticker === stock.ticker;
                    const isWatched = watchlist.includes(stock.ticker);
                    return (
                      <tr key={stock.ticker} className={isSelected ? "is-selected" : ""} onClick={() => setSelectedTicker(stock.ticker)}>
                        <td><div className="stock-name-cell"><button type="button" className={`watch-star ${isWatched ? "watched" : ""}`} onClick={(event) => { event.stopPropagation(); toggleWatchlist(stock.ticker); }} aria-label={isWatched ? t(`從觀察清單移除 ${stock.ticker}`, `Remove ${stock.ticker} from watchlist`) : t(`加入觀察清單 ${stock.ticker}`, `Add ${stock.ticker} to watchlist`)}>{isWatched ? "★" : "☆"}</button><span className={`ticker-badge market-${stock.market.toLowerCase()}`}>{stock.market}</span><span><strong>{stock.ticker}</strong><small>{stock.name} · {stock.sector}</small></span></div></td>
                        <td data-label={t("目前價格", "Current Price")}><span className="table-number">{formatPrice(stock.price, stock.market)}</span></td>
                        <td data-label={t("公允價值", "Fair Value")}><span className="fair-value-number">{formatPrice(stock.fairValue, stock.market)}</span><small className="range-hint">{t("區間", "Range")} {formatPrice(stock.rangeLow, stock.market)} – {formatPrice(stock.rangeHigh, stock.market)}</small></td>
                        <td data-label={t("上行空間", "Upside")}><span className={`upside-value ${stock.upside >= 0 ? "text-positive" : "text-negative"}`}><TrendMark positive={stock.upside >= 0} /> {formatSignedPercent(stock.upside)}</span></td>
                        <td data-label={t("品質", "Quality")}>{stock.qualityAvailable === false ? <span className="quality-unavailable" title={t("公開資料不足，未計算品質分數", "Insufficient public data for a quality score")}>—</span> : <div className="quality-score"><span className="score-bar"><span style={{ width: `${stock.qualityScore}%` }} /></span><strong>{stock.qualityScore}</strong></div>}</td>
                        <td data-label={t("風險", "Risk")}><RiskPill risk={stock.risk} language={language} /></td>
                        <td><button type="button" className="row-arrow" onClick={(event) => { event.stopPropagation(); selectStock(stock.ticker); }} aria-label={t(`查看 ${stock.ticker} 估值明細`, `View valuation details for ${stock.ticker}`)}>→</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredStocks.length === 0 && <div className="table-empty"><span className="empty-orbit">⌕</span><strong>{isMarketScanLoading ? t("正在掃描市場…", "Scanning the market…") : stocks.length ? t("目前名單沒有符合條件的標的", "No stocks in the current list match") : t("市場資料暫時無法載入", "Market data is temporarily unavailable")}</strong><p>{isMarketScanLoading ? t("正在整理上市與上櫃估值候選", "Reviewing listed and OTC valuation candidates") : stocks.length ? t("可切換篩選條件，或搜尋其他股票代碼", "Change the filter or search another ticker") : t("仍可在上方搜尋單一股票代碼", "You can still search for an individual ticker above")}</p><button type="button" onClick={() => document.getElementById("stock-search")?.focus()}>{t("搜尋股票代碼", "Search tickers")}</button></div>}
            </div>
            <div className="table-footer"><span>{t("顯示", "Showing")} {filteredStocks.length} / {displayedUniverseCount} {filter === "overvalued" ? t("檔高估候選；台股前 20＋美股前 20", "overvalued candidates; Taiwan top 20 + U.S. top 20") : filter === "undervalued" ? t("檔低估候選；台股前 20＋美股前 20", "undervalued candidates; Taiwan top 20 + U.S. top 20") : t("檔", "stocks")}</span><span><span className="legend-dot green-dot" />{t("價格低於模型價", "Below fair value")} <span className="legend-dot red-dot" />{t("價格高於模型價", "Above fair value")}</span></div>
          </div>

          {selected && (
            <aside id="valuation-detail" className="detail-panel panel" aria-label={t("個股估值明細", "Stock valuation details")}>
              <div className="detail-topline"><span className="section-kicker">VALUATION / 03</span><div className="detail-actions"><button type="button" className="detail-refresh" disabled={isLookupLoading} onClick={() => void lookupTicker(selected.ticker, true)}>{isLookupLoading ? t("更新中…", "Updating…") : t("↻ 更新資料", "↻ Refresh data")}</button><button type="button" className={`detail-watch ${watchlist.includes(selected.ticker) ? "watched" : ""}`} onClick={() => toggleWatchlist(selected.ticker)}>{watchlist.includes(selected.ticker) ? t("★ 已觀察", "★ Watching") : t("☆ 加入觀察", "☆ Add to watchlist")}</button></div></div>
              <div className="detail-title-row"><div><span className={`ticker-badge large market-${selected.market.toLowerCase()}`}>{selected.market}</span><div className="detail-ticker">{selected.ticker}</div><p>{selected.name} · {selected.sector}</p></div><RiskPill risk={selected.risk} language={language} /></div>
              <div className="price-hero"><div><span>{t("目前價格", "Current Price")}</span><strong>{formatPrice(selected.price, selected.market)}</strong><small>{t("資料日期", "Data date")} {selected.updatedAt}</small></div><div className={selected.upside >= 0 ? "hero-upside positive-box" : "hero-upside negative-box"}><span>{t("模型上行空間", "Model Upside")}</span><strong>{formatSignedPercent(selected.upside)}</strong><small>{selected.upside >= 0 ? t("價格低於估值", "Price below fair value") : t("價格高於估值", "Price above fair value")}</small></div></div>
              <div className="fair-value-focus"><div><span className="focus-label">{t("加權公允價值", "Weighted Fair Value")}</span><strong>{formatPrice(selected.fairValue, selected.market)}</strong></div><div className="range-track"><span className="range-line"><i style={{ left: `${clamp(((selected.price - selected.rangeLow) / (selected.rangeHigh - selected.rangeLow)) * 100, 4, 96)}%` }} /></span><div><span>{t("悲觀", "Bear")} {formatPrice(selected.rangeLow, selected.market)}</span><span>{t("樂觀", "Bull")} {formatPrice(selected.rangeHigh, selected.market)}</span></div><small>{t("價格位置", "Price position")} <b>{Math.round(clamp(((selected.price - selected.rangeLow) / (selected.rangeHigh - selected.rangeLow)) * 100, 0, 100))}%</b></small></div></div>
              <div className="detail-section"><div className="detail-section-title"><h3>{t("估值組成", "Valuation Models")}</h3><span>{t("權重合計 100%", "Total weight 100%")}</span></div><div className="model-list">{selected.models.map((model) => <div className="model-row" key={model.label}><div className="model-label"><span className="model-dot" /><span><strong>{language === "zh" ? model.label : translateModelLabel(model.label)}</strong><small>{language === "zh" ? model.explanation : englishModelExplanation(model.label, selected)}</small></span></div><div className="model-value"><strong>{formatPrice(model.value, selected.market)}</strong><small>{Math.round(model.weight * 100)}%</small></div></div>)}</div></div>
              <div className="detail-section fundamentals"><div className="detail-section-title"><h3>{t("品質與風險", "Quality & Risk")}</h3><span>{t("模型輸入", "Model inputs")}</span></div><div className="fundamental-grid"><div><span>{t("營收成長", "Revenue Growth")}</span><strong>{selected.qualityAvailable === false ? "—" : `${selected.revenueGrowth.toFixed(1)}%`}</strong></div><div><span>ROE</span><strong>{selected.roe ? `${selected.roe.toFixed(1)}%` : "—"}</strong></div><div><span>{t("負債比", "Debt Ratio")}</span><strong>{selected.qualityAvailable === false ? "—" : `${selected.debtRatio.toFixed(1)}%`}</strong></div><div><span>{t("不確定性", "Uncertainty")}</span><strong>{(selected.uncertainty * 100).toFixed(0)}%</strong></div></div><div className="quality-meter"><div><span>{t("財務品質分數", "Financial quality score")}</span><strong>{selected.qualityAvailable === false ? t("資料不足", "Insufficient data") : `${selected.qualityScore} / 100`}</strong></div><div className="meter"><span style={{ width: `${selected.qualityScore}%` }} /></div></div></div>
              <div className="detail-note"><span>i</span><p>{language === "zh" ? (selected.sourceNote || (selected.source === "手動輸入" ? "這是你手動建立的估值，請在財報更新後重新輸入基礎數據。" : "公開資料可能延遲或不完整；模型價格是研究起點，不代表即時報價或投資建議。")) : (selected.source === "手動輸入" ? "This is a manually created valuation. Update the inputs when new financial statements are available." : "Public data may be delayed or incomplete. Model values are a research starting point, not a live quote or investment advice.")}</p></div>
            </aside>
          )}
        </section>

        <section id="overview" className="overview-grid" aria-label={t("估值摘要", "Valuation summary")}>
          <article className="metric-card accent-card">
            <div className="metric-card-top"><span>{t("市場掃描", "Market Scan")}</span><span className="metric-icon">◉</span></div>
            <strong>{isMarketScanLoading ? "…" : scannedCount}<small> {t("檔", "stocks")}</small></strong>
            <p>{t(`台股 ${scannedByMarket.TW}＋美股 ${scannedByMarket.US}`, `Taiwan ${scannedByMarket.TW} + U.S. ${scannedByMarket.US}`)}</p>
          </article>
          <article className="metric-card">
            <div className="metric-card-top"><span>{t("低估候選", "Undervalued")}</span><span className="metric-icon green">↗</span></div>
            <strong>{undervaluedCount}<small> {t("檔", "stocks")}</small></strong>
            <p>{t(`台股 ${marketCandidates.filter((stock) => stock.market === "TW").length} · 美股 ${marketCandidates.filter((stock) => stock.market === "US").length}`, `Taiwan ${marketCandidates.filter((stock) => stock.market === "TW").length} · U.S. ${marketCandidates.filter((stock) => stock.market === "US").length}`)}</p>
          </article>
          <article className="metric-card">
            <div className="metric-card-top"><span>{t("高估候選", "Overvalued")}</span><span className="metric-icon red">↘</span></div>
            <strong>{overvaluedCount}<small> {t("檔", "stocks")}</small></strong>
            <p>{t(`台股 ${overvaluedCandidates.filter((stock) => stock.market === "TW").length} · 美股 ${overvaluedCandidates.filter((stock) => stock.market === "US").length}`, `Taiwan ${overvaluedCandidates.filter((stock) => stock.market === "TW").length} · U.S. ${overvaluedCandidates.filter((stock) => stock.market === "US").length}`)}</p>
          </article>
          <article className="metric-card muted-card">
            <div className="metric-card-top"><span>{t("資料狀態", "Data Status")}</span><span className="live-label"><span className="status-dot" />{t("公開資料", "Public data")}</span></div>
            <strong className="date-value">{t("自動＋手動", "Auto + Manual")}</strong>
            <p>{t("SEC／TWSE／方舟截圖，可追溯來源", "SEC, TWSE, and ARKER sources are traceable")}</p>
          </article>
        </section>

        <section id="watchlist" className="watchlist-section">
          <div className="section-heading-row"><div><p className="section-kicker">YOUR WATCHLIST / 05</p><h2>{t("我的觀察清單", "My Watchlist")}</h2><p>{t("把你正在研究的股票集中在這裡，搜尋代碼即可回到估值明細", "Keep the stocks you are researching together and return to their valuation details in one click")}</p></div><button type="button" className="outline-button" onClick={() => setShowAddForm(true)}><span>＋</span> {t("新增自訂標的", "Add custom stock")}</button></div>
          <div className="watchlist-cards">
            {watchlistStocks.length > 0 ? watchlistStocks.map((stock) => <button key={stock.ticker} type="button" className={`watch-card ${selected?.ticker === stock.ticker ? "active" : ""}`} onClick={() => selectStock(stock.ticker)}><div><span className={`ticker-badge market-${stock.market.toLowerCase()}`}>{stock.market}</span><strong>{stock.ticker}</strong><small>{stock.name}</small></div><div><strong className={stock.upside >= 0 ? "text-positive" : "text-negative"}>{formatSignedPercent(stock.upside)}</strong><small>{t("上行空間", "Upside")}</small></div><span className="card-arrow">↗</span></button>) : <div className="watchlist-empty">{t("還沒有觀察標的，從上方排行榜加入，或手動建立一筆估值。", "Your watchlist is empty. Add a stock from the ranking above or create a custom valuation.")}</div>}
          </div>
        </section>

        <section id="method" className="method-section">
          <div className="method-intro"><p className="section-kicker">HOW IT WORKS / 06</p><h2>{t("不是預測價格，", "We do not predict prices;")}<br /><em>{t("是建立安全邊際。", "we build a margin of safety.")}</em></h2><p>{t("系統會依產業與資料完整度選用模型，排除不適用與極端結果，再依模型分歧自動放大或縮小估值區間。這比固定三模型更接近專業估值流程，但不等同付費資料商的分析師共識預測。", "The system selects models by industry and data completeness, removes unsuitable or extreme results, and derives the valuation range from model dispersion. This is closer to a professional workflow than a fixed three-model average, but it is not the same as paid analyst-consensus forecasts.")}</p></div>
              <div className="method-cards"><article><span className="method-number">01</span><h3>{t("現金流與盈餘能力", "Cash Flow & Earnings Power")}</h3><p>{t("加入五年 DCF 與盈餘能力價值；金融業因現金流結構不同會自動停用 DCF。", "Adds a five-year DCF and Earnings Power Value; DCF is disabled for financial companies whose cash flows require different treatment.")}</p><span className="method-weight">{t("依產業動態選用", "Selected by industry")}</span></article><article><span className="method-number">02</span><h3>{t("倍數與資產估值", "Multiples & Asset Value")}</h3><p>{t("綜合 PE、PB、FCF 倍數與 Graham 防禦估值；高 ROE 輕資產公司不套用 PB 與 Graham，避免資產模型低估科技與品牌企業。", "Combines P/E, P/B, FCF multiples, and Graham defensive value. P/B and Graham are disabled for high-ROE asset-light companies to avoid understating technology and brand businesses.")}</p><span className="method-weight">{t("依商業型態重新加權", "Reweighted by business type")}</span></article><article><span className="method-number">03</span><h3>{t("股利、異常值與區間", "Dividends, Outliers & Range")}</h3><p>{t("有股利資料時加入 DDM；若模型值極端偏離市場且仍有其他可靠模型，會自動排除。不確定性由模型數量與分歧程度決定。", "Adds a DDM when dividends are available. Extreme market-relative values are removed when enough reliable alternatives remain, and uncertainty reflects model count and dispersion.")}</p><span className="method-weight">{t("風險自動校準", "Risk calibrated automatically")}</span></article></div>
        </section>

        <section className="data-layer-banner"><div className="data-layer-icon">↯</div><div><strong>{t("公開資料層已接入", "Public data layer connected")}</strong><p>{t("台股市場掃描採 TWSE／TPEx；美股市場掃描以 Nasdaq 價格配對 SEC XBRL 年度財務資料。個股明細仍優先查詢最新公開申報；資料不足的模型會被排除，不會用示範數字補空白。", "The Taiwan scan uses TWSE and TPEx data; the U.S. scan matches Nasdaq prices with annual SEC XBRL fundamentals. Stock details still prioritize the latest public filings, and missing models are excluded rather than filled with sample values.")}</p></div><span className="coming-label">TRACEABLE DATA</span></section>

        {showAddForm && (
          <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddForm(false); }}>
            <div className="add-modal" role="dialog" aria-modal="true" aria-labelledby="add-modal-title">
              <div className="modal-heading">
                <div><p className="section-kicker">CUSTOM INPUT</p><h2 id="add-modal-title">{t("建立一筆估值", "Create a Valuation")}</h2><p>{t("輸入你觀察的股票代碼與基本數據，立即算出模型價格", "Enter a ticker and its fundamentals to calculate a model value")}</p></div>
                <button type="button" className="modal-close" onClick={() => setShowAddForm(false)} aria-label={t("關閉", "Close")}>×</button>
              </div>
              <form onSubmit={addCustomStock}>
                <div className="form-grid">
                  <label>{t("股票代碼", "Ticker")}<input required value={form.ticker} onChange={(event) => updateForm("ticker", event.target.value)} placeholder={t("例如 2603", "e.g. AAPL")} /></label>
                  <label>{t("股票名稱", "Company Name")}<input required value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder={t("例如 長榮", "e.g. Apple")} /></label>
                  <label>{t("市場", "Market")}<select value={form.market} onChange={(event) => updateForm("market", event.target.value as Market)}><option value="TW">{t("台股", "Taiwan")}</option><option value="US">{t("美股", "U.S.")}</option></select></label>
                  <label>{t("產業", "Sector")}<input value={form.sector} onChange={(event) => updateForm("sector", event.target.value)} placeholder={t("例如 航運", "e.g. Technology")} /></label>
                </div>
                <div className="form-divider"><span>{t("價格必填；三種估值基礎至少填一項", "Price is required; enter at least one valuation input")}</span></div>
                <div className="form-grid four">
                  <label>{t("目前價格", "Current Price")}<input required type="number" step="any" min="0.0001" value={form.price} onChange={(event) => updateForm("price", event.target.value)} placeholder="0" /></label>
                  <label>EPS<input type="number" step="any" value={form.eps} onChange={(event) => updateForm("eps", event.target.value)} placeholder={t("可留空", "Optional")} /></label>
                  <label>{t("每股淨值", "Book Value / Share")}<input type="number" step="any" value={form.bvps} onChange={(event) => updateForm("bvps", event.target.value)} placeholder={t("可留空", "Optional")} /></label>
                  <label>{t("每股 FCF", "FCF / Share")}<input type="number" step="any" value={form.fcfPerShare} onChange={(event) => updateForm("fcfPerShare", event.target.value)} placeholder={t("可留空", "Optional")} /></label>
                </div>
                <div className="form-divider"><span>{t("估值假設（可先用預設值）", "Valuation assumptions (defaults are available)")}</span></div>
                <div className="form-grid four">
                  <label>{t("目標 PE", "Target P/E")}<input type="number" step="any" min="0" value={form.targetPe} onChange={(event) => updateForm("targetPe", event.target.value)} /></label>
                  <label>{t("目標 PB", "Target P/B")}<input type="number" step="any" min="0" value={form.targetPb} onChange={(event) => updateForm("targetPb", event.target.value)} /></label>
                  <label>{t("FCF 倍數", "FCF Multiple")}<input type="number" step="any" min="0" value={form.targetFcfMultiple} onChange={(event) => updateForm("targetFcfMultiple", event.target.value)} /></label>
                  <label>{t("不確定性 %", "Uncertainty %")}<input type="number" step="any" min="5" max="60" value={form.uncertainty} onChange={(event) => updateForm("uncertainty", event.target.value)} /></label>
                </div>
                <div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setShowAddForm(false)}>{t("取消", "Cancel")}</button><button type="submit" className="primary-button">{t("計算並加入觀察清單", "Calculate and add to watchlist")} <span>→</span></button></div>
              </form>
            </div>
          </div>
        )}

        <footer className="footer"><div><span>穩盈價值雷達 · WenYing Value Radar</span><small>{t("方舟／ARKER 名稱與圖標屬其原權利人；本工具為穩盈基金的獨立研究網站，並非方舟官方服務。", "The ARKER name and logo belong to their respective owner. This is an independent WenYing Fund research tool and is not an official ARKER service.")}</small></div><span>{t("估值是研究起點，不是單獨的買賣指令", "Valuation is a research starting point, not a standalone trading signal")}</span></footer>
      </div>
    </main>
  );
}
