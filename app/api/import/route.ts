import { NextRequest, NextResponse } from "next/server";
import { deduplicateArkCandidates, parseArkDocument, type SecTickerRow } from "../../../lib/ark-parser";

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

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  const response = await fetch(url, { headers, next: { revalidate: 60 * 60 * 12 } });
  if (!response.ok) throw new Error(`代碼資料來源回應 ${response.status}`);
  return response.json() as Promise<T>;
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
      fetchJson<TwseRow[]>("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"),
      fetchJson<TpexRow[]>("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"),
      fetchJson<Record<string, SecTickerRow>>("https://www.sec.gov/files/company_tickers.json", SEC_HEADERS),
    ]);
    const twSymbols = new Map<string, { name: string; price: number }>([
      ...twse.map((row) => [row.Code, { name: row.Name, price: numeric(row.ClosingPrice) }] as const),
      ...tpex.map((row) => [row.SecuritiesCompanyCode, { name: row.CompanyName, price: numeric(row.Close) }] as const),
    ]);
    const usSymbols = new Map(Object.values(sec).map((row) => [row.ticker.toUpperCase(), row]));

    const candidates = documents.flatMap((document) => parseArkDocument(document, twSymbols, usSymbols));
    return NextResponse.json({ candidates: deduplicateArkCandidates(candidates) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "截圖文字暫時無法分析";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
