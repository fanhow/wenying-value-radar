import { NextRequest, NextResponse } from "next/server";
import { deduplicateArkCandidates, parseArkDocument, type SecTickerRow } from "../../../lib/ark-parser";
import { fallbackTaiwanSymbols, fallbackUsSymbols } from "../../../lib/ark-directory";

type ImportDocument = { fileName?: string; text?: string };
type TwseRow = { Code: string; Name: string; ClosingPrice?: string };
type TpexRow = { SecuritiesCompanyCode: string; CompanyName: string; Close?: string };

const SEC_HEADERS = {
  "User-Agent": "WenYingValueRadar/1.0 213328508+fanhow@users.noreply.github.com",
  Accept: "application/json",
};

function numeric(value: unknown) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function fetchRows<T>(source: string, url: string, headers?: HeadersInit) {
  try {
    const response = await fetch(url, { headers, next: { revalidate: 60 * 60 * 12 } });
    if (!response.ok) return { rows: [] as T[], warning: `${source} ${response.status}` };
    return { rows: await response.json() as T[], warning: "" };
  } catch {
    return { rows: [] as T[], warning: `${source} 暫時無法連線` };
  }
}

async function fetchSecDirectory() {
  try {
    const response = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: SEC_HEADERS,
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!response.ok) return { rows: [] as SecTickerRow[], warning: `SEC ${response.status}` };
    const payload = await response.json() as Record<string, SecTickerRow>;
    return { rows: Object.values(payload), warning: "" };
  } catch {
    return { rows: [] as SecTickerRow[], warning: "SEC 暫時無法連線" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { documents?: ImportDocument[] };
    const documents = (body.documents ?? [])
      .slice(0, 12)
      .map((document, index) => ({
        fileName: String(document.fileName || `screenshot-${index + 1}`).slice(0, 120),
        text: String(document.text || "").slice(0, 60_000),
      }))
      .filter((document) => document.text.trim());
    if (!documents.length) return NextResponse.json({ error: "沒有可辨識的截圖文字" }, { status: 400 });

    const [twse, tpex, sec] = await Promise.all([
      fetchRows<TwseRow>("TWSE", "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"),
      fetchRows<TpexRow>("TPEx", "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"),
      fetchSecDirectory(),
    ]);
    const twSymbols = fallbackTaiwanSymbols();
    for (const row of twse.rows) twSymbols.set(row.Code, { name: row.Name, price: numeric(row.ClosingPrice) });
    for (const row of tpex.rows) twSymbols.set(row.SecuritiesCompanyCode, { name: row.CompanyName, price: numeric(row.Close) });
    const usSymbols = fallbackUsSymbols();
    for (const row of sec.rows) {
      const ticker = row.ticker.toUpperCase();
      usSymbols.set(ticker, { ...row, price: usSymbols.get(ticker)?.price });
    }

    const candidates = documents.flatMap((document) => parseArkDocument(document, twSymbols, usSymbols));
    const warnings = [twse.warning, tpex.warning, sec.warning].filter(Boolean);
    return NextResponse.json({
      candidates: deduplicateArkCandidates(candidates),
      usedFallbackDirectory: warnings.length > 0,
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "截圖文字暫時無法分析";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
