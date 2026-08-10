import { NextRequest, NextResponse } from "next/server";
import { rankMarketSymbols, type MarketSymbol } from "../../../lib/stock-directory";

type TwseSymbolRow = { Code?: string; Name?: string };
type TpexSymbolRow = { SecuritiesCompanyCode?: string; CompanyName?: string };
type TpexCompanyRow = {
  SecuritiesCompanyCode?: string;
  CompanyAbbreviation?: string;
  CompanyName?: string;
};
type SecTickerRow = { ticker?: string; title?: string };

const DIRECTORY_HEADERS = {
  Accept: "application/json",
  "User-Agent": "WenYing Value Radar fanhow@hotmail.com",
};

async function optionalJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: DIRECTORY_HEADERS,
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!response.ok) return null;
    return response.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > 40) return NextResponse.json({ symbols: [] });

  let entries: MarketSymbol[] = [];
  if (/^\d/.test(query)) {
    const [twseRows, tpexRows, tpexCompanies] = await Promise.all([
      optionalJson<TwseSymbolRow[]>("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"),
      optionalJson<TpexSymbolRow[]>("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"),
      optionalJson<TpexCompanyRow[]>("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O"),
    ]);
    entries = [
      ...(twseRows ?? []).map((row) => ({ ticker: row.Code?.trim() ?? "", name: row.Name?.trim() ?? "", market: "TW" as const })),
      ...(tpexRows ?? []).map((row) => ({ ticker: row.SecuritiesCompanyCode?.trim() ?? "", name: row.CompanyName?.trim() ?? "", market: "TW" as const })),
      ...(tpexCompanies ?? []).map((row) => ({
        ticker: row.SecuritiesCompanyCode?.trim() ?? "",
        name: row.CompanyAbbreviation?.trim() || row.CompanyName?.trim() || "",
        market: "TW" as const,
      })),
    ];
  } else {
    const secRows = await optionalJson<Record<string, SecTickerRow>>("https://www.sec.gov/files/company_tickers.json");
    entries = Object.values(secRows ?? {}).map((row) => ({
      ticker: row.ticker?.trim().toUpperCase() ?? "",
      name: row.title?.trim() ?? "",
      market: "US" as const,
    }));
  }

  return NextResponse.json({ symbols: rankMarketSymbols(entries, query) });
}
