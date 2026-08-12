"use client";

import Link from "next/link";
import { type ChangeEvent, useState } from "react";
import { stockDetailHref } from "../../lib/navigation";
import { calculateStock, type Market, type StockInput } from "../../lib/valuation";
import { useLanguage } from "../language-context";
import { SiteHeader } from "../site-header";

type ImportStatus = "計算中" | "已加入" | "需要確認";

type ImportCandidate = {
  id: string;
  ticker: string;
  market: Market;
  capturedPrice?: number;
  capturedNav?: number;
  capturedName?: string;
  fileName: string;
  status: ImportStatus;
  message?: string;
  stock?: StockInput;
};

const numberFormatter = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });

function translateMessage(message: string) {
  const exact: Record<string, string> = {
    "尚未上傳截圖": "No screenshots uploaded yet",
    "單張截圖不可超過 15 MB": "Each screenshot must be 15 MB or smaller",
    "正在讀取股票代碼與價格": "Reading tickers and prices",
    "正在載入文字辨識器": "Loading text recognition",
    "正在核對台股與美股代碼": "Checking Taiwan and U.S. tickers",
    "截圖辨識暫時無法使用": "Screenshot recognition is temporarily unavailable",
  };
  if (exact[message]) return exact[message];
  return message
    .replace(/^準備辨識 (\d+) 張截圖$/, "Preparing to scan $1 screenshot(s)")
    .replace(/^辨識第 (\d+) \/ (\d+) 張截圖$/, "Scanning screenshot $1 of $2")
    .replace(/^已辨識 (\d+) 檔，正在取得公開財務資料$/, "$1 ticker(s) found; retrieving public financial data")
    .replace(/^完成：(\d+) 檔已加入，(\d+) 檔需要確認$/, "Complete: $1 added, $2 need review")
    .replace(/^完成：(\d+) 檔已加入，(\d+) 檔需要確認（已啟用內建名錄備援）$/, "Complete: $1 added, $2 need review (built-in directory fallback used)")
    .replace(/^辨識失敗：/, "Recognition failed: ");
}

function translateStatus(status: ImportStatus) {
  return ({ "計算中": "Calculating", "已加入": "Added", "需要確認": "Review" })[status];
}

function formatPrice(value: number, market: Market) {
  return `${market === "TW" ? "NT$" : "US$"} ${numberFormatter.format(value)}`;
}

function mergeIntoStorage(addedStocks: StockInput[]) {
  if (!addedStocks.length) return;
  let savedStocks: StockInput[] = [];
  let savedWatchlist: string[] = [];
  try {
    savedStocks = JSON.parse(localStorage.getItem("wenying-value-radar-stocks-v1") || "[]") as StockInput[];
    savedWatchlist = JSON.parse(localStorage.getItem("wenying-value-radar-watchlist-v1") || "[]") as string[];
  } catch {
    savedStocks = [];
    savedWatchlist = [];
  }
  const importedTickers = new Set(addedStocks.map((stock) => stock.ticker));
  localStorage.setItem(
    "wenying-value-radar-stocks-v1",
    JSON.stringify([...savedStocks.filter((stock) => !importedTickers.has(stock.ticker)), ...addedStocks]),
  );
  localStorage.setItem(
    "wenying-value-radar-watchlist-v1",
    JSON.stringify([...new Set([...savedWatchlist, ...addedStocks.map((stock) => stock.ticker)])]),
  );
}

async function saveImportLog(rows: ImportCandidate[]) {
  const importedAt = new Date().toISOString();
  const batchId = crypto.randomUUID();
  const observations = rows.flatMap((candidate) => {
    if (!candidate.stock) return [];
    const stock = calculateStock(candidate.stock);
    return [{
      batchId,
      importedAt,
      fileName: candidate.fileName,
      market: stock.market,
      ticker: stock.ticker,
      name: stock.name,
      capturedPrice: candidate.capturedPrice,
      marketPrice: stock.price,
      fairValue: stock.fairValue,
      valuationGap: stock.upside,
      confidence: stock.valuationConfidence,
    }];
  });
  if (!observations.length) return;
  try {
    await fetch("/api/ark-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observations }),
    });
  } catch {
    // The import itself remains successful when the optional research log is unavailable.
  }
}

export default function ArkPage() {
  const { language, t } = useLanguage();
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("尚未上傳截圖");
  const [isImporting, setIsImporting] = useState(false);

  async function requestValuation(candidate: Omit<ImportCandidate, "status" | "message" | "stock">) {
    const response = await fetch("/api/valuation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    });
    const payload = await response.json() as { stock?: StockInput; error?: string };
    if (!response.ok || !payload.stock) throw new Error(payload.error || "暫時無法建立估值");
    return payload.stock;
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])].slice(0, 12);
    if (!files.length) return;
    if (files.some((file) => file.size > 15 * 1024 * 1024)) {
      setMessage("單張截圖不可超過 15 MB");
      event.target.value = "";
      return;
    }

    setIsImporting(true);
    setProgress(2);
    setMessage(`準備辨識 ${files.length} 張截圖`);
    setCandidates([]);

    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (status) => {
          if (typeof status.progress === "number") {
            setProgress(Math.round(status.progress * 62));
            setMessage(status.status === "recognizing text" ? "正在讀取股票代碼與價格" : "正在載入文字辨識器");
          }
        },
      });
      const documents: { fileName: string; text: string }[] = [];

      try {
        await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "6" as Tesseract.PSM });
        for (let index = 0; index < files.length; index += 1) {
          setMessage(`辨識第 ${index + 1} / ${files.length} 張截圖`);
          const file = files[index];
          const result = await worker.recognize(file);
          documents.push({ fileName: file.name, text: result.data.text });
        }
      } finally {
        await worker.terminate();
      }

      setMessage("正在核對台股與美股代碼");
      const importResponse = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents }),
      });
      const importPayload = await importResponse.json() as {
        candidates?: Omit<ImportCandidate, "status" | "message" | "stock">[];
        usedFallbackDirectory?: boolean;
        error?: string;
      };
      if (!importResponse.ok) throw new Error(importPayload.error || "無法核對股票代碼");
      const recognized = importPayload.candidates ?? [];
      if (!recognized.length) throw new Error("沒有找到可驗證的台股或美股代碼");

      setCandidates(recognized.map((candidate) => ({ ...candidate, status: "計算中" })));
      setProgress(68);
      setMessage(`已辨識 ${recognized.length} 檔，正在取得公開財務資料`);

      const resolved: ImportCandidate[] = [];
      for (let index = 0; index < recognized.length; index += 1) {
        const candidate = recognized[index];
        try {
          const stock = await requestValuation(candidate);
          resolved.push({ ...candidate, status: "已加入", stock });
        } catch (error) {
          resolved.push({
            ...candidate,
            status: "需要確認",
            message: error instanceof Error ? error.message : "暫時無法建立估值",
          });
        }
        setCandidates([...resolved, ...recognized.slice(index + 1).map((item) => ({ ...item, status: "計算中" as const }))]);
        setProgress(68 + Math.round(((index + 1) / recognized.length) * 31));
      }

      const addedStocks = resolved.flatMap((candidate) => candidate.stock ? [candidate.stock] : []);
      mergeIntoStorage(addedStocks);
      await saveImportLog(resolved);
      setCandidates(resolved);
      setProgress(100);
      const fallbackNote = importPayload.usedFallbackDirectory ? "（已啟用內建名錄備援）" : "";
      setMessage(`完成：${addedStocks.length} 檔已加入，${resolved.length - addedStocks.length} 檔需要確認${fallbackNote}`);
    } catch (error) {
      setMessage(error instanceof Error ? `辨識失敗：${error.message}` : "截圖辨識暫時無法使用");
      setProgress(0);
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  }

  return (
    <main className="app-shell">
      <SiteHeader active="ark" />
      <div className="page-content ark-page">
        <section className="ark-page-heading" aria-labelledby="ark-page-title">
          <p className="section-kicker">ARK SCREENSHOT / 02</p>
          <h1 id="ark-page-title">{t("把方舟名單，", "Turn your ARKER list")}<br /><em>{t("直接變成公允價值清單。", "into a fair-value watchlist.")}</em></h1>
          <p>{t("上傳方舟 App 的台股 ETF 或美股截圖，系統會辨識代碼與畫面價格、核對公開名錄，再逐檔建立估值並同步到首頁觀察清單。", "Upload Taiwan ETF or U.S. stock screenshots from the ARKER app. The tool reads tickers and prices, verifies public directories, builds valuations, and syncs them to your home watchlist.")}</p>
        </section>

        <section className="ark-import-section ark-page-import" aria-labelledby="ark-upload-title">
          <div className="ark-import-copy">
            <div className="ark-brand-row"><span className="ark-brand-logo" aria-hidden="true" /><div><span>ARKER {t("方舟運算", "Strategy")}</span><small>{t("獨立匯入工具", "Standalone import tool")}</small></div></div>
            <p className="section-kicker">PRIVATE OCR</p>
            <h2 id="ark-upload-title">{t("選擇手機截圖，", "Choose screenshots,")}<br />{t("其餘交給價值雷達", "then let Value Radar take over")}</h2>
            <p>{t("原始圖片只在你的瀏覽器中辨識，不會上傳。即使 TWSE、TPEx 或 SEC 暫時拒絕連線，系統也會改用內建名錄與財務快照，不會因單一來源 403 讓整批失敗。", "Images are recognized only in your browser and are never uploaded. If TWSE, TPEx, or SEC temporarily blocks a request, built-in directories and financial snapshots keep the batch running.")}</p>
            <div className="ark-flow" aria-label={t("匯入步驟", "Import steps")}><span>{t("上傳截圖", "Upload")}</span><b>→</b><span>{t("辨識代碼", "Recognize")}</span><b>→</b><span>{t("計算公允價值", "Calculate")}</span></div>
          </div>

          <div className="ark-upload-card">
            <label className={`ark-dropzone ${isImporting ? "is-busy" : ""}`}>
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={isImporting} onChange={(event) => void handleUpload(event)} />
              <span className="upload-icon">⇧</span>
              <strong>{isImporting ? t("正在處理截圖", "Processing screenshots") : t("選擇方舟 App 截圖", "Choose ARKER App screenshots")}</strong>
              <small>{t("支援 PNG、JPG、WebP，可一次上傳多張", "PNG, JPG, and WebP supported; select multiple files")}</small>
            </label>
            <div className="import-status" aria-live="polite">
              <div><span>{language === "zh" ? message : translateMessage(message)}</span><b>{progress}%</b></div>
              <span className="import-progress"><i style={{ width: `${progress}%` }} /></span>
            </div>
          </div>
        </section>

        {candidates.length > 0 && (
          <section className="ark-result-panel" aria-labelledby="ark-results-title">
            <div className="ark-result-heading">
              <div><p className="section-kicker">VALUATION RESULTS</p><h2 id="ark-results-title">{t("辨識與估值結果", "Recognition and valuation results")}</h2></div>
              <Link href="/#overview">{t("回首頁查看完整估值 →", "View full valuations on home →")}</Link>
            </div>
            <div className="ark-result-grid">
              {candidates.map((candidate) => {
                const stock = candidate.stock ? calculateStock(candidate.stock) : null;
                const cardContent = (
                  <>
                    <div className="ark-result-top"><span className={`ticker-badge market-${candidate.market.toLowerCase()}`}>{candidate.market}</span><span className={`import-state state-${candidate.status === "已加入" ? "done" : candidate.status === "需要確認" ? "warn" : "working"}`}>{language === "zh" ? candidate.status : translateStatus(candidate.status)}</span></div>
                    <strong>{candidate.ticker}</strong>
                    <p>{candidate.capturedName || candidate.fileName}</p>
                    {stock ? <><div className="ark-result-values"><span>{t("目前價格", "Price")}<b>{formatPrice(stock.price, stock.market)}</b></span><span>{stock.valuationConfidence === "low" ? t("歷史初估", "Historical estimate") : t("公允價值", "Fair value")}<b>{formatPrice(stock.fairValue, stock.market)}</b></span><span>{stock.valuationConfidence === "low" ? t("判讀狀態", "Interpretation") : t("模型差距", "Model gap")}<b className={stock.valuationConfidence === "low" ? "text-uncertain" : stock.upside >= 0 ? "text-positive" : "text-negative"}>{stock.valuationConfidence === "low" ? t("資料限制", "Data limits") : `${stock.upside >= 0 ? "+" : ""}${(stock.upside * 100).toFixed(1)}%`}</b></span></div><small className={`ark-confidence confidence-${stock.valuationConfidence}`}>{stock.valuationConfidence === "low" ? t("低信心 · 點擊查看模型與原因 →", "Low confidence · view models and reason →") : t("點擊查看完整估值 →", "View full valuation →")}</small></> : <small title={candidate.message}>{candidate.message || t("正在計算…", "Calculating…")}</small>}
                  </>
                );
                return stock ? (
                  <Link className="ark-result-card ark-result-link" href={stockDetailHref(candidate.ticker)} key={candidate.id} aria-label={t(`查看 ${candidate.ticker} 完整估值`, `View full valuation for ${candidate.ticker}`)}>{cardContent}</Link>
                ) : (
                  <article className="ark-result-card" key={candidate.id}>{cardContent}</article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
