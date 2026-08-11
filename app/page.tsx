"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateStock, clamp, type Market, type Stock, type StockInput } from "../lib/valuation";
import type { InstitutionalSignal } from "../lib/fund-signal";
import { findStockDirectoryEntries, safeLookupError } from "../lib/stock-directory";
import { shouldRefreshSavedStock } from "../lib/data-freshness";
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
  const label = risk === "低"
    ? (language === "zh" ? "較穩定" : "Stable")
    : risk === "中"
      ? (language === "zh" ? "一般" : "Moderate")
      : (language === "zh" ? "需審慎" : "Needs review");
  return <span className={`risk-pill risk-${risk === "低" ? "low" : risk === "中" ? "medium" : "high"}`}>{label}</span>;
}

function ConfidencePill({ confidence, language }: { confidence: Stock["valuationConfidence"]; language: Language }) {
  const label = confidence === "high"
    ? (language === "zh" ? "高信心" : "High confidence")
    : confidence === "medium"
      ? (language === "zh" ? "中信心" : "Medium confidence")
      : (language === "zh" ? "低信心初估" : "Low-confidence estimate");
  return <span className={`confidence-pill confidence-${confidence}`}>{label}</span>;
}

function InstitutionalSignalPill({ signal, language }: { signal?: InstitutionalSignal; language: Language }) {
  if (!signal) return null;
  const changeLabel = signal.increasedByCount > 0
    ? (language === "zh" ? `${signal.heldByCount}/${signal.trackedFundCount} 出現 · ${signal.increasedByCount}/${signal.heldByCount} 加倉` : `${signal.heldByCount}/${signal.trackedFundCount} reported · ${signal.increasedByCount}/${signal.heldByCount} increased`)
    : (language === "zh" ? `${signal.heldByCount}/${signal.trackedFundCount} 出現` : `${signal.heldByCount}/${signal.trackedFundCount} reported`);
  return <span className="institutional-signal-pill">{language === "zh" ? "大戶訊號" : "Institutional signal"} · {changeLabel}</span>;
}

function InstitutionalSignalPanel({ signal, language }: { signal?: InstitutionalSignal; language: Language }) {
  if (!signal) return null;
  const heldLabel = language === "zh"
    ? `前六大基金公開前十大持股中，${signal.heldByCount}/${signal.trackedFundCount} 出現`
    : `${signal.heldByCount}/${signal.trackedFundCount} of the top-six funds appear in the published top holdings`;
  const increasedLabel = language === "zh"
    ? `${signal.increasedByCount}/${signal.heldByCount} 加倉`
    : `${signal.increasedByCount}/${signal.heldByCount} increased`;
  const changedLabel = signal.reducedByCount > 0
    ? (language === "zh" ? ` · ${signal.reducedByCount}/${signal.heldByCount} 減倉` : ` · ${signal.reducedByCount}/${signal.heldByCount} reduced`)
    : "";
  return <div className="institutional-signal-panel">
    <div className="institutional-signal-heading">
      <div><span>{language === "zh" ? "大戶訊號" : "Institutional signal"}</span><strong>{heldLabel} · {increasedLabel}{changedLabel}</strong></div>
      <small>{language === "zh" ? "獨立參考，不直接加到公允價值" : "Separate context; not added to fair value"}</small>
    </div>
    <div className="institutional-signal-holdings">
      {signal.holdings.map((holding) => <span key={holding.fundName} className={`institutional-holding-change ${holding.changeType}`}>
        {holding.fundName} · {holding.changeType === "new" ? (language === "zh" ? "新建" : "new") : holding.changeType === "increased" ? (language === "zh" ? "加倉" : "increased") : holding.changeType === "reduced" ? (language === "zh" ? "減倉" : "reduced") : (language === "zh" ? "持平" : "unchanged")}
        {holding.changePercent !== null ? ` ${holding.changePercent >= 0 ? "+" : ""}${holding.changePercent.toFixed(1)}%` : ""}
      </span>)}
    </div>
    <p>{language === "zh"
      ? `資料來自 SEC 13F，申報有延遲，且只反映公開多頭前十大持股；未出現不代表沒有持倉，也不代表基金認同本模型估值。申報日 ${signal.reportDate ?? "—"}。`
      : `Data comes from SEC 13F filings with a reporting lag and covers published long positions only; absence is not proof of no position, and ownership is not an endorsement of this valuation. Report date: ${signal.reportDate ?? "—"}.`}</p>
  </div>;
}

function TrendMark({ positive }: { positive: boolean }) {
  return <span className={`trend-mark ${positive ? "positive" : "negative"}`}>{positive ? "↗" : "↘"}</span>;
}

type AppliedValuationModel = Stock["models"][number];
type ExcludedValuationModel = Stock["excludedModels"][number];

const modelCopy: Record<string, { zh: string; en: string; enDescription: string }> = {
  "etf-inav": { zh: "即時淨值法", en: "iNAV Method", enDescription: "Uses the iNAV captured from the ARKER screenshot." },
  pe: { zh: "本益比法", en: "P/E Method", enDescription: "Applies a target P/E multiple to positive earnings per share." },
  pb: { zh: "股價淨值比法", en: "P/B Method", enDescription: "Applies a target P/B multiple to book value per share." },
  "p-fcf": { zh: "自由現金流倍數法", en: "P/FCF Method", enDescription: "Applies a target multiple to free cash flow per share." },
  "dcf-fcf-5y": { zh: "5 年折現現金流法", en: "5-Year DCF", enDescription: "Discounts five years of fading free-cash-flow growth and a terminal value using CAPM/WACC." },
  "dcf-fcf-10y": { zh: "10 年折現現金流法", en: "10-Year DCF", enDescription: "Discounts ten years of fading free-cash-flow growth and a terminal value using CAPM/WACC." },
  "ev-revenue": { zh: "EV／營收倍數法", en: "EV/Revenue Method", enDescription: "Applies an enterprise-value multiple to revenue, then adjusts for net debt per share." },
  "ev-ebitda": { zh: "EV／EBITDA 倍數法", en: "EV/EBITDA Method", enDescription: "Applies an enterprise-value multiple to EBITDA, then adjusts for net debt per share." },
  "ev-ebit": { zh: "EV／EBIT 倍數法", en: "EV/EBIT Method", enDescription: "Applies an enterprise-value multiple to EBIT, then adjusts for net debt per share." },
  epv: { zh: "盈餘能力價值法", en: "Earnings Power Value", enDescription: "Capitalizes normalized free cash flow only when the zero-growth, mature-business test is satisfied." },
  graham: { zh: "Graham 防禦估值", en: "Graham Defensive Value", enDescription: "Uses earnings and book value for mature businesses with suitable leverage and asset intensity." },
  "ddm-stable": { zh: "穩定成長股利折現法", en: "Stable-Growth DDM", enDescription: "Discounts sustainable dividends only when payout and mature-growth conditions are satisfied." },
};

function localizedModelLabel(model: AppliedValuationModel | ExcludedValuationModel, language: Language) {
  const copy = modelCopy[model.id];
  if (copy) return language === "zh" ? copy.zh : copy.en;
  return model.label;
}

function localizedModelExplanation(model: AppliedValuationModel, language: Language) {
  if (language === "zh") return model.explanation;
  return modelCopy[model.id]?.enDescription
    ?? "Uses the available public financial inputs under this model's applicability rules.";
}

function englishExclusionReason(model: ExcludedValuationModel) {
  if (model.reason.includes("對數分布") || model.reason.includes("極端")) {
    return "Removed by a price-independent robust outlier filter because the result was far from the other applicable models.";
  }
  if (model.id === "pe") return "Positive EPS and a valid target P/E are required.";
  if (model.id === "pb") return "Book-value inputs are missing, or the asset method would systematically understate an asset-light company.";
  if (model.id === "p-fcf") return "Positive free cash flow and a valid multiple are required; this method is not used for financial companies.";
  if (model.id.startsWith("dcf")) return "Free cash flow or a valid WACC and terminal-growth relationship is missing; standard corporate DCF is not used for financial companies.";
  if (model.id.startsWith("ev-")) return "The operating metric or target multiple is missing; standard EV multiples are not used for financial companies.";
  if (model.id === "epv") return "The company does not pass the mature, stable-earnings test, or normalized cash flow is unavailable.";
  if (model.id === "graham") return "Earnings, book value, leverage, or asset-intensity conditions are not suitable for this defensive model.";
  if (model.id.startsWith("ddm")) return "Dividend, payout, maturity, or discount-spread conditions are not sustainable enough for this model.";
  return "Required inputs are missing or this model is not appropriate for the company.";
}

function formatDataBasis(value: string, language: Language) {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  const labels: Record<string, { zh: string; en: string }> = {
    ltm: { zh: "LTM（近十二個月）", en: "LTM (last twelve months)" },
    annual: { zh: "年度財報", en: "Annual filing" },
    historical: { zh: "公開歷史財報", en: "Public historical filings" },
    estimated: { zh: "公開資料推估", en: "Public-data estimate" },
    "market-ratio": { zh: "市場比率", en: "Market ratio" },
    "market ratio": { zh: "市場比率", en: "Market ratio" },
  };
  return labels[normalized]?.[language] ?? value;
}

function valuationRangePosition(price: number, low: number, high: number) {
  const width = high - low;
  if (!Number.isFinite(width) || width <= 0) return 50;
  return clamp(((price - low) / width) * 100, 0, 100);
}

function formatModelWeight(weight: number) {
  const percent = weight * 100;
  return `${percent.toFixed(Number.isInteger(percent) ? 0 : 1)}%`;
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
  const initialTickerHandled = useRef(false);
  const initialSavedRefreshHandled = useRef(false);
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
  const selectedRangePosition = selected
    ? valuationRangePosition(selected.price, selected.rangeLow, selected.rangeHigh)
    : 50;

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
        isRefreshable: stock.source !== "手動輸入",
      }));
    const directory = findStockDirectoryEntries(query)
      .filter((entry) => !loaded.some((stock) => stock.ticker === entry.ticker))
      .map((entry) => ({
        ticker: entry.ticker,
        market: entry.market,
        name: language === "zh" ? entry.nameZh : entry.nameEn,
        upside: null,
        isLoaded: false,
        isRefreshable: false,
      }));
    const remote = remoteSymbols
      .filter((entry) => !loaded.some((stock) => stock.ticker === entry.ticker)
        && !directory.some((stock) => stock.ticker === entry.ticker))
      .map((entry) => ({ ...entry, upside: null, isLoaded: false, isRefreshable: false }));

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

  function openWatchlistStock(ticker: string) {
    const local = stocks.find((stock) => stock.ticker === ticker);
    if (local && local.source !== "手動輸入" && local.source !== "方舟截圖") {
      void lookupTicker(ticker, true);
      return;
    }
    selectStock(ticker);
  }

  function openRankedStock(ticker: string) {
    selectStock(ticker);
    void lookupTicker(ticker, true);
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

  const lookupTicker = useCallback(async (value = query, forceRefresh = false) => {
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
  }, [language, query, stocks]);

  useEffect(() => {
    if (!hasLoadedStorage || initialSavedRefreshHandled.current) return;
    initialSavedRefreshHandled.current = true;
    const saved = stockInputs.find((stock) => stock.ticker === selectedTicker);
    if (saved && shouldRefreshSavedStock(saved)) void lookupTicker(saved.ticker, true);
  }, [hasLoadedStorage, lookupTicker, selectedTicker, stockInputs]);

  useEffect(() => {
    if (!hasLoadedStorage || initialTickerHandled.current) return;
    initialTickerHandled.current = true;
    const ticker = new URLSearchParams(window.location.search).get("ticker")?.trim().toUpperCase();
    if (!ticker || !/^[A-Z0-9-]{1,10}$/.test(ticker)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setQuery(ticker);
      const local = stockInputs.find((stock) => stock.ticker === ticker);
      if (local) {
        setSelectedTicker(ticker);
        window.setTimeout(() => document.getElementById("valuation-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      }
      setIsLookupLoading(true);
      setLookupError("");
      void fetch("/api/valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, market: /^\d/.test(ticker) ? "TW" : "US" }),
        signal: controller.signal,
      }).then(async (response) => {
        const payload = await response.json() as { stock?: StockInput; error?: string };
        if (!response.ok || !payload.stock) throw new Error(payload.error || "暫時無法建立估值");
        setStockInputs((current) => [...current.filter((item) => item.ticker !== payload.stock?.ticker), payload.stock as StockInput]);
        setWatchlist((current) => current.includes(ticker) ? current : [...current, ticker]);
        setSelectedTicker(ticker);
        window.setTimeout(() => document.getElementById("valuation-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      }).catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLookupError(safeLookupError(error instanceof Error ? error.message : "", language));
        }
      }).finally(() => {
        if (!controller.signal.aborted) setIsLookupLoading(false);
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hasLoadedStorage, language, stockInputs]);

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
            <h1 id="page-title">{t("看見價格", "See the price")}<br /><em>{t("也看見它與價值的距離", "and the distance to value")}</em></h1>
            <p className="hero-description">{t("搜尋台股與美股、匯入方舟名單，以透明模型比較目前價格、公允價值與上行空間", "Search Taiwan and U.S. stocks or import an ARKER list, then compare market price, fair value, and potential upside through transparent models")}</p>
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
                    const exact = stocks.find((stock) => stock.ticker.toLowerCase() === query.trim().toLowerCase());
                    if (exact && exact.source !== "手動輸入" && exact.source !== "方舟截圖") {
                      void lookupTicker(exact.ticker, true);
                      return;
                    }
                    const suggestion = searchSuggestions[0];
                    if (suggestion?.isLoaded && !suggestion.isRefreshable) selectStock(suggestion.ticker);
                    else void lookupTicker(suggestion?.ticker ?? query, Boolean(suggestion?.isLoaded));
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
              {watchlist.slice(0, 4).map((ticker) => <button key={ticker} type="button" onClick={() => openWatchlistStock(ticker)}>{ticker}</button>)}
            </div>
            {query && !exactMatch && searchSuggestions.length > 0 && (
              <div className="search-results-popover">
                {searchSuggestions.map((suggestion) => (
                  <button type="button" key={suggestion.ticker} onClick={() => suggestion.isLoaded && !suggestion.isRefreshable ? selectStock(suggestion.ticker) : void lookupTicker(suggestion.ticker, Boolean(suggestion.isLoaded))}>
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
              {([["all", t("全部", "All")], ["undervalued", t("低估候選 40", "Top 40 Undervalued")], ["overvalued", t("高估候選 40", "Top 40 Overvalued")], ["quality", t("高品質", "High quality")], ["risk", t("審慎檢視", "Needs review")]] as [Filter, string][]).map(([key, label]) => (
                <button key={key} type="button" className={filter === key ? "selected" : ""} onClick={() => setFilter(key)} role="tab" aria-selected={filter === key}>{label}</button>
              ))}
            </div>
            <div className="stock-table-wrap">
              <table className="stock-table">
                <thead>
                  <tr><th scope="col">{t("標的", "Stock")}</th><th scope="col">{t("現價", "Price")}</th><th scope="col">{t("模型參考值", "Model Estimate")}</th><th scope="col">{t("估值差距", "Valuation Gap")}</th><th scope="col">{t("品質", "Quality")}</th><th scope="col">{t("模型狀態／信心", "Model Status / Confidence")}</th><th scope="col"><span className="sr-only">{t("操作", "Actions")}</span></th></tr>
                </thead>
                <tbody>
                  {filteredStocks.map((stock) => {
                    const isSelected = selected?.ticker === stock.ticker;
                    const isWatched = watchlist.includes(stock.ticker);
                    return (
                      <tr key={stock.ticker} className={isSelected ? "is-selected" : ""} role="button" tabIndex={0} onClick={() => openRankedStock(stock.ticker)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openRankedStock(stock.ticker); } }}>
                        <td><div className="stock-name-cell"><button type="button" className={`watch-star ${isWatched ? "watched" : ""}`} onClick={(event) => { event.stopPropagation(); toggleWatchlist(stock.ticker); }} aria-label={isWatched ? t(`從觀察清單移除 ${stock.ticker}`, `Remove ${stock.ticker} from watchlist`) : t(`加入觀察清單 ${stock.ticker}`, `Add ${stock.ticker} to watchlist`)}>{isWatched ? "★" : "☆"}</button><span className={`ticker-badge market-${stock.market.toLowerCase()}`}>{stock.market}</span><span><strong>{stock.ticker}</strong><small>{stock.name} · {stock.sector}</small></span></div></td>
                        <td data-label={t("目前價格", "Current Price")}><span className="table-number">{formatPrice(stock.price, stock.market)}</span></td>
                        <td data-label={t("模型參考值", "Model Estimate")}><span className="fair-value-number">{formatPrice(stock.fairValue, stock.market)}</span><small className="range-hint">{stock.valuationConfidence === "low" ? t("低信心歷史初估", "Low-confidence historical estimate") : `${t("區間", "Range")} ${formatPrice(stock.rangeLow, stock.market)} – ${formatPrice(stock.rangeHigh, stock.market)}`}</small></td>
                        <td data-label={t("估值差距", "Valuation Gap")}><span className={`upside-value ${stock.valuationConfidence === "low" ? "text-uncertain" : stock.upside >= 0 ? "text-positive" : "text-negative"}`}><TrendMark positive={stock.upside >= 0} /> {formatSignedPercent(stock.upside)}</span></td>
                        <td data-label={t("品質", "Quality")}>{stock.qualityAvailable === false ? <span className="quality-unavailable" title={t("公開資料不足，未計算品質分數", "Insufficient public data for a quality score")}>—</span> : <div className="quality-score"><span className="score-bar"><span style={{ width: `${stock.qualityScore}%` }} /></span><strong>{stock.qualityScore}</strong></div>}</td>
                        <td data-label={t("模型狀態／信心", "Model Status / Confidence")}><div className="signal-pills"><RiskPill risk={stock.risk} language={language} /><ConfidencePill confidence={stock.valuationConfidence} language={language} /></div></td>
                        <td><button type="button" className="row-arrow" onClick={(event) => { event.stopPropagation(); openRankedStock(stock.ticker); }} aria-label={t(`查看 ${stock.ticker} 估值明細`, `View valuation details for ${stock.ticker}`)}>→</button></td>
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
              <div className="detail-title-row"><div><span className={`ticker-badge large market-${selected.market.toLowerCase()}`}>{selected.market}</span><div className="detail-ticker">{selected.ticker}</div><p>{selected.name} · {selected.sector}</p></div><div className="detail-signal-pills"><ConfidencePill confidence={selected.valuationConfidence} language={language} /><RiskPill risk={selected.risk} language={language} /><InstitutionalSignalPill signal={selected.institutionalSignal} language={language} /></div></div>
              <div className="price-hero"><div><span>{t("目前價格", "Current Price")}</span><strong>{formatPrice(selected.price, selected.market)}</strong>{selected.updatedAt && <small>{t("價格資料日期", "Price data date")} {selected.updatedAt}</small>}</div><div className={selected.valuationConfidence === "low" ? "hero-upside neutral-box" : selected.upside >= 0 ? "hero-upside positive-box" : "hero-upside negative-box"}><span>{selected.valuationConfidence === "low" ? t("歷史模型差距", "Historical Model Gap") : t("模型上行空間", "Model Upside")}</span><strong>{formatSignedPercent(selected.upside)}</strong><small>{selected.valuationConfidence === "low" ? t("公開財務資料不足，僅供初步研究", "Incomplete public financial data; preliminary research only") : selected.upside >= 0 ? t("價格低於估值", "Price below fair value") : t("價格高於估值", "Price above fair value")}</small></div></div>
              <InstitutionalSignalPanel signal={selected.institutionalSignal} language={language} />
              <div className="fair-value-focus">
                <div><span className="focus-label">{t("模型中位公允價值", "Median Model Fair Value")}</span><strong>{formatPrice(selected.fairValue, selected.market)}</strong></div>
                <div className="range-track"><span className="range-line"><i style={{ left: `${clamp(selectedRangePosition, 4, 96)}%` }} /></span><div><span>{t("悲觀", "Bear")} {formatPrice(selected.rangeLow, selected.market)}</span><span>{t("樂觀", "Bull")} {formatPrice(selected.rangeHigh, selected.market)}</span></div><small>{t("價格位置", "Price position")} <b>{Math.round(selectedRangePosition)}%</b></small></div>
                <div className="valuation-meta-grid">
                  <div><span>CAPM / WACC</span><strong>CAPM {(selected.assumptions.costOfEquity * 100).toFixed(1)}% · WACC {(selected.assumptions.wacc * 100).toFixed(1)}%</strong><small>β {selected.assumptions.beta.toFixed(2)} · {t("稅後債務成本", "After-tax debt cost")} {(selected.assumptions.afterTaxCostOfDebt * 100).toFixed(1)}%</small></div>
                  <div><span>{t("資料基礎", "Data Basis")}</span><strong>{formatDataBasis(selected.assumptions.dataBasis, language)}</strong>{selected.assumptions.financialDataDate && <small>{t("財務日期", "Financial date")} {selected.assumptions.financialDataDate}</small>}</div>
                  {selected.assumptions.fcfNormalizationApplied && <div><span>{t("FCF 正規化", "FCF Normalization")}</span><strong>{formatPrice(selected.assumptions.reportedFcfPerShare, selected.market)} → {formatPrice(selected.assumptions.normalizedFcfPerShare, selected.market)}</strong><small>{t("避免單期現金流重複放大多個模型", "Prevents one-period cash flow from amplifying several models")}</small></div>}
                </div>
                {selected.assumptions.structuralThemes.length > 0 && <div className="structural-theme-panel">
                  <div className="structural-theme-heading"><div><span>{t("結構性趨勢", "Structural Themes")}</span><strong>{selected.assumptions.structuralThemes.map((theme) => language === "zh" ? theme.nameZh : theme.nameEn).join(" · ")}</strong></div><small>{t("資料截至", "As of")} {selected.assumptions.themeAsOf} · {t("下次檢視", "Review")} {selected.assumptions.themeReviewAfter}</small></div>
                  <div className="structural-theme-tags">{selected.assumptions.structuralThemes.map((theme) => <span key={theme.id}>{language === "zh" ? theme.nameZh : theme.nameEn} · {t("模型推導", "Model inference")} {(theme.growthLow * 100).toFixed(0)}–{(theme.growthHigh * 100).toFixed(0)}%</span>)}</div>
                  <p>{selected.assumptions.structuralBlendWeight > 0 ? t(`只影響 DCF 起始成長率，混合權重 ${(selected.assumptions.structuralBlendWeight * 100).toFixed(0)}%；不直接提高其他模型或給予題材溢價。`, `Affects only DCF starting growth at a ${(selected.assumptions.structuralBlendWeight * 100).toFixed(0)}% blend; it does not raise other models or add a theme premium.`) : t("已辨識產業趨勢，但目前財務條件不足，因此沒有影響估值。", "A structural theme is identified, but current financial conditions are insufficient, so it does not affect valuation.")}</p>
                  <div className="structural-theme-sources">{selected.assumptions.structuralThemes.flatMap((theme) => theme.sources).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</div>
                </div>}
              </div>
              <div className="detail-section">
                <div className="detail-section-title"><h3>{t("納入模型", "Included Models")}</h3><span>{t("適用模型等權列示 · 中央值採中位數", "Applicable models listed equally · median center")}</span></div>
                <div className="model-list">{selected.models.map((model) => (
                  <div className="model-row" key={model.id || model.label}>
                    <div className="model-label"><span className="model-dot" /><span><strong>{localizedModelLabel(model, language)}</strong><small>{localizedModelExplanation(model, language)}</small></span></div>
                    <div className="model-value"><span>{t("基準", "Base")}</span><strong>{formatPrice(model.value, selected.market)}</strong><small>{t("區間", "Range")} {formatPrice(model.rangeLow, selected.market)} – {formatPrice(model.rangeHigh, selected.market)}</small><em>{t("等權參考", "Equal reference")} {formatModelWeight(model.weight)}</em></div>
                  </div>
                ))}</div>
              </div>
              <div className="detail-section fundamentals"><div className="detail-section-title"><h3>{t("品質與模型狀態", "Quality & Model Status")}</h3><span>{t("模型輸入", "Model inputs")}</span></div><div className="fundamental-grid"><div><span>{t("營收成長", "Revenue Growth")}</span><strong>{selected.qualityAvailable === false ? "—" : `${selected.revenueGrowth.toFixed(1)}%`}</strong></div><div><span>ROE</span><strong>{selected.roe ? `${selected.roe.toFixed(1)}%` : "—"}</strong></div><div><span>{t("負債比", "Debt Ratio")}</span><strong>{selected.qualityAvailable === false ? "—" : `${selected.debtRatio.toFixed(1)}%`}</strong></div><div><span>{t("不確定性", "Uncertainty")}</span><strong>{(selected.uncertainty * 100).toFixed(0)}%</strong></div></div><div className="quality-meter"><div><span>{t("財務品質分數", "Financial quality score")}</span><strong>{selected.qualityAvailable === false ? t("資料不足", "Insufficient data") : `${selected.qualityScore} / 100`}</strong></div><div className="meter"><span style={{ width: `${selected.qualityScore}%` }} /></div></div></div>
              {selected.excludedModels.length > 0 && <div className="detail-section excluded-models-section"><div className="detail-section-title"><h3>{t("排除模型", "Excluded Models")}</h3><span>{t("未納入中央值", "Not included in the center")}</span></div><div className="excluded-model-list">{selected.excludedModels.map((model) => <div className="excluded-model-row" key={`excluded-${model.id}`}><strong>{localizedModelLabel(model, language)}</strong><p>{language === "zh" ? model.reason : englishExclusionReason(model)}</p></div>)}</div></div>}
              {selected.valuationConfidence === "low" && <div className="confidence-warning"><strong>{t("為什麼是低信心？", "Why low confidence?")}</strong><p>{selected.historicalCaution ? t("目前主要依據公開歷史財報；資料日期、模型數量或模型分歧使結果的不確定性較高。畫面保留計算結果供研究，但不做強烈高低估判定。", "The estimate mainly uses public historical filings. Data age, model count, or model dispersion increases uncertainty, so the result remains visible for research without a strong valuation call.") : t("目前公開資料缺少足夠的現金流、成長或負債資訊，因此只能提供初步參考。", "Public cash-flow, growth, or leverage data is incomplete, so this is only a preliminary reference.")}</p></div>}
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
            {watchlistStocks.length > 0 ? watchlistStocks.map((stock) => <button key={stock.ticker} type="button" className={`watch-card ${selected?.ticker === stock.ticker ? "active" : ""}`} onClick={() => selectStock(stock.ticker)}><div><span className={`ticker-badge market-${stock.market.toLowerCase()}`}>{stock.market}</span><strong>{stock.ticker}</strong><small>{stock.name}</small></div><div><strong className={stock.valuationConfidence === "low" ? "text-uncertain" : stock.upside >= 0 ? "text-positive" : "text-negative"}>{formatSignedPercent(stock.upside)}</strong><small>{stock.valuationConfidence === "low" ? t("低信心初估", "Low-confidence estimate") : t("上行空間", "Upside")}</small></div><span className="card-arrow">↗</span></button>) : <div className="watchlist-empty">{t("還沒有觀察標的，從上方排行榜加入，或手動建立一筆估值。", "Your watchlist is empty. Add a stock from the ranking above or create a custom valuation.")}</div>}
          </div>
        </section>

        <section id="method" className="method-section">
          <div className="method-intro"><p className="section-kicker">HOW IT WORKS / 06</p><h2>{t("不是預測價格，", "We do not predict prices;")}<br /><em>{t("是建立安全邊際。", "we build a margin of safety.")}</em></h2><p>{t("系統只納入真正適用的模型，中央公允價值採中位數，降低同一項現金流或單一極端模型重複放大的影響。不適用模型會列出排除原因，robust filter 也不參考目前股價。估值只使用公開 LTM、年度財報與市場比率；公開資料不足時會降低信心，不假裝精準。", "Only applicable models are included, and the central fair value uses the median to reduce repeated amplification from one cash-flow input or an extreme model. Exclusions are explained, and the robust filter does not use the current price. Estimates use only public LTM, annual filings, and market ratios; incomplete public data lowers confidence.")}</p></div>
              <div className="method-cards"><article><span className="method-number">01</span><h3>{t("CAPM 與內在價值", "CAPM & Intrinsic Value")}</h3><p>{t("股權現金流以 CAPM 股權成本折現；具官方證據的結構性產業趨勢最多只占 DCF 起始成長假設 25%，並逐年收斂。", "Equity cash flow is discounted at the CAPM cost of equity. Evidence-backed structural themes contribute at most 25% of DCF starting growth and fade over time.")}</p><span className="method-weight">{t("可追溯估值假設", "Traceable assumptions")}</span></article><article><span className="method-number">02</span><h3>{t("穩健模型組合", "Robust Model Set")}</h3><p>{t("PE、PB、P/FCF、獨立 EV 倍數、DCF、EPV、Graham 與 DDM 先通過適用性測試，再以中位數形成中央公允價值。現金流轉換率異常時先正規化，避免同一異常值同時放大 P/FCF 與兩個 DCF。", "P/E, P/B, P/FCF, independent EV multiples, DCF, EPV, Graham, and DDM first pass applicability tests, then form the central fair value by median. Abnormal cash-flow conversion is normalized before it can amplify P/FCF and both DCF models.")}</p><span className="method-weight">{t("價格無關的異常值檢查", "Price-independent outlier check")}</span></article><article><span className="method-number">03</span><h3>{t("公開資料與信心限制", "Public Data & Confidence Limits")}</h3><p>{t("優先採最新可取得的 LTM 或年度公開財報與市場比率。若公開資料的日期、現金流或成長資料不足，仍保留研究結果，但降低信心且不做強烈高低估判定。", "The latest available public LTM or annual filings and market ratios are preferred. Results remain visible when public dates, cash flow, or growth data are incomplete, but confidence is reduced and no strong valuation call is made.")}</p><span className="method-weight">{t("避免假精準", "Avoid false precision")}</span></article></div>
        </section>

        <section className="data-layer-banner"><div className="data-layer-icon">↯</div><div><strong>{t("公開資料層已接入", "Public data layer connected")}</strong><p>{t("台股市場掃描採 TWSE／TPEx；美股以 Nasdaq 價格配對 SEC XBRL 年度與可計算的 LTM 財務資料。每日價格與季度財報由背景快照排程更新，若來源暫時不可用則保留上一份可追溯資料。結構性趨勢快照按月檢視，逐檔標示資料日期、推導區間與官方來源。", "The Taiwan scan uses TWSE and TPEx data. U.S. prices are matched with SEC XBRL annual and computable LTM financials. Background snapshots refresh prices daily and core financials quarterly; if a source is temporarily unavailable, the last traceable snapshot remains in use. The structural-theme snapshot is reviewed monthly with dates, inferred ranges, and official sources shown per stock.")}</p></div><span className="coming-label">TRACEABLE DATA</span></section>

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
