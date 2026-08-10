import { NextRequest, NextResponse } from "next/server";
import { clamp, valuationTargets } from "../../../lib/valuation";
import { parseYahooTaiwanHtml } from "../../../lib/stock-directory";

type Market = "TW" | "US";

type ValuationRequest = {
  ticker?: string;
  market?: Market;
  capturedPrice?: number | null;
  capturedNav?: number | null;
  capturedName?: string | null;
};

type TwseRatioRow = { Date: string; Code: string; Name: string; PEratio: string; PBratio: string };
type TwseDailyRow = { Date?: string; Code: string; Name: string; ClosingPrice: string };
type TpexRatioRow = {
  Date: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  PriceEarningRatio: string;
  PriceBookRatio: string;
};
type TpexQuoteRow = {
  Date: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  Close: string;
};

type SecFact = {
  val: number;
  start?: string;
  end?: string;
  filed?: string;
  form?: string;
  frame?: string;
};

type SecCompanyFacts = {
  entityName?: string;
  facts?: Record<string, Record<string, { units?: Record<string, SecFact[]> }>>;
};

type SecTickerRow = { cik_str: number; ticker: string; title: string };

const SEC_HEADERS = {
  "User-Agent": "WenYing Value Radar fanhow@hotmail.com",
  Accept: "application/json",
};

let secTickerMapPromise: Promise<Record<string, SecTickerRow>> | null = null;

function numeric(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTaiwanDate(value?: string) {
  if (!value || !/^\d{7}$/.test(value)) return value || new Date().toISOString().slice(0, 10);
  const year = Number(value.slice(0, 3)) + 1911;
  return `${year}-${value.slice(3, 5)}-${value.slice(5, 7)}`;
}

function isTaiwanEtf(ticker: string) {
  return /^00[A-Z0-9]{2,5}$/.test(ticker);
}

function preferCapturedPrice(capturedValue: unknown, referencePrice: number) {
  const captured = numeric(capturedValue);
  if (!captured) return referencePrice;
  if (!referencePrice) return captured;
  const difference = Math.abs(captured - referencePrice) / referencePrice;
  return difference <= 0.35 ? captured : referencePrice;
}

function latestFacts(
  companyFacts: SecCompanyFacts,
  taxonomy: string,
  conceptNames: string[],
  preferredUnits: string[],
) {
  const taxonomyFacts = companyFacts.facts?.[taxonomy] ?? {};
  for (const conceptName of conceptNames) {
    const units = taxonomyFacts[conceptName]?.units ?? {};
    for (const unit of [...preferredUnits, ...Object.keys(units)]) {
      const values = units[unit];
      if (!values?.length) continue;
      return [...values]
        .filter((fact) => Number.isFinite(fact.val))
        .sort((a, b) => `${b.end ?? ""}${b.filed ?? ""}`.localeCompare(`${a.end ?? ""}${a.filed ?? ""}`));
    }
  }
  return [];
}

function latestAnnualFact(
  companyFacts: SecCompanyFacts,
  taxonomy: string,
  conceptNames: string[],
  preferredUnits: string[],
) {
  const facts = latestFacts(companyFacts, taxonomy, conceptNames, preferredUnits);
  return facts.find((fact) => ["10-K", "20-F", "40-F"].includes(fact.form ?? "") && /^CY\d{4}$/.test(fact.frame ?? ""))
    ?? facts.find((fact) => ["10-K", "20-F", "40-F"].includes(fact.form ?? ""))
    ?? facts[0];
}

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  try {
    const response = await fetch(url, {
      headers,
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!response.ok) throw new Error(`資料來源回應 ${response.status}`);
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("資料來源回應")) throw error;
    throw new Error("公開資料暫時無法連線");
  }
}

async function fetchOptionalJson<T>(url: string, headers?: HeadersInit): Promise<T[]> {
  try {
    return await fetchJson<T[]>(url, headers);
  } catch {
    return [];
  }
}

async function yahooTaiwanSnapshot(ticker: string) {
  try {
    const response = await fetch(`https://tw.stock.yahoo.com/quote/${encodeURIComponent(ticker)}/eps`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)" },
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!response.ok) return null;
    return parseYahooTaiwanHtml(await response.text());
  } catch {
    return null;
  }
}

async function secTickerMap() {
  secTickerMapPromise ??= fetchJson<Record<string, SecTickerRow>>(
    "https://www.sec.gov/files/company_tickers.json",
    SEC_HEADERS,
  );
  return secTickerMapPromise;
}

type NasdaqQuoteResponse = {
  data?: {
    companyName?: string;
    primaryData?: { lastSalePrice?: string; lastTradeTimestamp?: string };
    secondaryData?: { lastSalePrice?: string; lastTradeTimestamp?: string } | null;
  } | null;
};

async function nasdaqMarketPrice(ticker: string) {
  try {
    const response = await fetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/info?assetclass=stocks`, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)",
      },
      next: { revalidate: 60 * 15 },
    });
    if (!response.ok) return { price: 0, name: "", updatedAt: "" };
    const payload = await response.json() as NasdaqQuoteResponse;
    const quote = payload.data?.primaryData ?? payload.data?.secondaryData;
    return {
      price: numeric(quote?.lastSalePrice?.replace("$", "")),
      name: payload.data?.companyName ?? "",
      updatedAt: quote?.lastTradeTimestamp ?? "",
    };
  } catch {
    return { price: 0, name: "", updatedAt: "" };
  }
}

async function valueUsStock(body: ValuationRequest, ticker: string) {
  const map = await secTickerMap();
  const company = Object.values(map).find((row) => row.ticker.toUpperCase() === ticker);
  if (!company) throw new Error("SEC 公司名錄中找不到這個美股代碼");

  const cik = String(company.cik_str).padStart(10, "0");
  const facts = await fetchJson<SecCompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, SEC_HEADERS);
  const taxonomy = facts.facts?.["us-gaap"] ? "us-gaap" : "ifrs-full";
  const isUsGaap = taxonomy === "us-gaap";

  const epsFact = latestAnnualFact(
    facts,
    taxonomy,
    isUsGaap ? ["EarningsPerShareDiluted", "EarningsPerShareBasic"] : ["DilutedEarningsLossPerShare", "BasicEarningsLossPerShare"],
    ["USD/shares", "USD / shares"],
  );
  const equityFact = latestFacts(
    facts,
    taxonomy,
    isUsGaap ? ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] : ["EquityAttributableToOwnersOfParent", "Equity"],
    ["USD"],
  )[0];
  const sharesFact = latestFacts(
    facts,
    isUsGaap ? "dei" : taxonomy,
    isUsGaap ? ["EntityCommonStockSharesOutstanding"] : ["NumberOfSharesOutstanding"],
    ["shares"],
  )[0] ?? latestFacts(
    facts,
    taxonomy,
    isUsGaap ? ["WeightedAverageNumberOfDilutedSharesOutstanding"] : ["DilutedWeightedAverageShares"],
    ["shares"],
  )[0];
  const operatingCashFact = latestAnnualFact(
    facts,
    taxonomy,
    isUsGaap ? ["NetCashProvidedByUsedInOperatingActivities"] : ["CashFlowsFromUsedInOperatingActivities"],
    ["USD"],
  );
  const capexFact = latestAnnualFact(
    facts,
    taxonomy,
    isUsGaap ? ["PaymentsToAcquirePropertyPlantAndEquipment"] : ["PurchaseOfPropertyPlantAndEquipment"],
    ["USD"],
  );
  const revenueFacts = latestFacts(
    facts,
    taxonomy,
    isUsGaap ? ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"] : ["Revenue"],
    ["USD"],
  ).filter((fact) => ["10-K", "20-F", "40-F"].includes(fact.form ?? ""));
  const netIncomeFact = latestAnnualFact(
    facts,
    taxonomy,
    isUsGaap ? ["NetIncomeLoss", "ProfitLoss"] : ["ProfitLoss"],
    ["USD"],
  );
  const assetsFact = latestFacts(facts, taxonomy, isUsGaap ? ["Assets"] : ["Assets"], ["USD"])[0];
  const liabilitiesFact = latestFacts(facts, taxonomy, isUsGaap ? ["Liabilities"] : ["Liabilities"], ["USD"])[0];

  const shares = numeric(sharesFact?.val);
  const eps = Math.max(numeric(epsFact?.val), 0);
  const bvps = shares > 0 ? Math.max(numeric(equityFact?.val) / shares, 0) : 0;
  const annualFcf = numeric(operatingCashFact?.val) - Math.abs(numeric(capexFact?.val));
  const fcfPerShare = shares > 0 ? Math.max(annualFcf / shares, 0) : 0;
  const marketQuote = await nasdaqMarketPrice(ticker);
  const price = preferCapturedPrice(body.capturedPrice, marketQuote.price);

  const annualRevenueFacts = revenueFacts.filter((fact) => /^CY\d{4}$/.test(fact.frame ?? ""));
  const uniqueRevenue = (annualRevenueFacts.length ? annualRevenueFacts : revenueFacts)
    .filter((fact, index, all) => fact.end && all.findIndex((item) => item.end === fact.end && item.start === fact.start) === index);
  const revenueGrowth = uniqueRevenue[0]?.val && uniqueRevenue[1]?.val
    ? ((uniqueRevenue[0].val - uniqueRevenue[1].val) / Math.abs(uniqueRevenue[1].val)) * 100
    : 0;
  const roe = equityFact?.val ? (numeric(netIncomeFact?.val) / Math.abs(equityFact.val)) * 100 : 0;
  const debtRatio = assetsFact?.val ? (numeric(liabilitiesFact?.val) / Math.abs(assetsFact.val)) * 100 : 0;

  if (!price) throw new Error("找不到可用價格，請改用含股價的方舟截圖或手動輸入");
  if (!eps && !bvps && !fcfPerShare) throw new Error("公開申報資料不足，暫時無法建立可靠估值");

  const targets = valuationTargets(revenueGrowth, roe, debtRatio);
  return {
    ticker,
    name: body.capturedName?.trim() || facts.entityName || marketQuote.name || company.title,
    market: "US" as const,
    assetType: "EQUITY" as const,
    sector: "美股公開發行公司",
    price,
    eps,
    bvps,
    fcfPerShare,
    ...targets,
    revenueGrowth: clamp(revenueGrowth, -100, 200),
    roe: clamp(roe, -100, 200),
    debtRatio: clamp(debtRatio, 0, 100),
    uncertainty: 0.25,
    updatedAt: marketQuote.updatedAt || epsFact?.end || new Date().toISOString().slice(0, 10),
    source: "自動資料" as const,
    sourceNote: `財務數據取自 SEC EDGAR 公開申報；價格${numeric(body.capturedPrice) && price === numeric(body.capturedPrice) ? "採用方舟截圖" : "採用 Nasdaq 市場資訊"}。虧損、負淨值或負自由現金流模型會自動排除`,
  };
}

async function valueTwStock(body: ValuationRequest, ticker: string) {
  const [twseRatios, twseDaily] = await Promise.all([
    fetchJson<TwseRatioRow[]>("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"),
    fetchJson<TwseDailyRow[]>("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"),
  ]);
  const twseRatio = twseRatios.find((row) => row.Code === ticker);
  const twseQuote = twseDaily.find((row) => row.Code === ticker);
  const tpexHeaders = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)",
  };
  const [tpexRatios, tpexQuotes] = twseRatio && twseQuote
    ? [[], []] as [TpexRatioRow[], TpexQuoteRow[]]
    : await Promise.all([
      fetchOptionalJson<TpexRatioRow>("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis", tpexHeaders),
      fetchOptionalJson<TpexQuoteRow>("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes", tpexHeaders),
    ]);
  const tpexRatio = tpexRatios.find((row) => row.SecuritiesCompanyCode === ticker);
  const tpexQuote = tpexQuotes.find((row) => row.SecuritiesCompanyCode === ticker);
  const yahoo = !twseRatio || !twseQuote ? await yahooTaiwanSnapshot(ticker) : null;
  const ratio = twseRatio
    ? { date: twseRatio.Date, name: twseRatio.Name, pe: twseRatio.PEratio, pb: twseRatio.PBratio, exchange: "TWSE" }
    : tpexRatio
      ? { date: tpexRatio.Date, name: tpexRatio.CompanyName, pe: tpexRatio.PriceEarningRatio, pb: tpexRatio.PriceBookRatio, exchange: "TPEx" }
      : yahoo
        ? {
          date: yahoo.updatedAt,
          name: yahoo.name,
          pe: yahoo.eps > 0 ? String(yahoo.price / yahoo.eps) : "0",
          pb: yahoo.bvps > 0 ? String(yahoo.price / yahoo.bvps) : "0",
          exchange: "TPEx",
        }
      : null;
  const quote = twseQuote
    ? { date: twseQuote.Date, name: twseQuote.Name, close: twseQuote.ClosingPrice, exchange: "TWSE" }
    : tpexQuote
      ? { date: tpexQuote.Date, name: tpexQuote.CompanyName, close: tpexQuote.Close, exchange: "TPEx" }
      : yahoo
        ? { date: yahoo.updatedAt, name: yahoo.name, close: String(yahoo.price), exchange: "TPEx" }
      : null;
  const capturedNav = numeric(body.capturedNav);
  const closingPrice = numeric(quote?.close);
  const price = preferCapturedPrice(body.capturedPrice, closingPrice);

  if (isTaiwanEtf(ticker)) {
    if (!capturedNav) throw new Error("ETF 需要含「即時淨值」欄位的方舟截圖才能估值");
    const etfName = body.capturedName?.trim() || quote?.name || ticker;
    const isLeveragedOrInverse = /(?:正2|反1|2X|INVERSE|LEVERAGED)/i.test(etfName) || /[LR]$/.test(ticker);
    return {
      ticker,
      name: etfName,
      market: "TW" as const,
      assetType: "ETF" as const,
      sector: "ETF",
      price: price || capturedNav,
      eps: capturedNav,
      bvps: capturedNav,
      fcfPerShare: capturedNav,
      targetPe: 1,
      targetPb: 1,
      targetFcfMultiple: 1,
      revenueGrowth: 0,
      roe: 0,
      debtRatio: 0,
      uncertainty: 0.02,
      qualityAvailable: false,
      riskOverride: isLeveragedOrInverse ? "高" as const : "中" as const,
      updatedAt: ratio?.date || quote?.date || new Date().toISOString().slice(0, 10),
      source: "方舟截圖" as const,
      sourceNote: `ETF 以方舟畫面中的即時淨值（iNAV）作為參考值；它不是股票企業價值估算，且盤後可能失去時效${isLeveragedOrInverse ? "。此標的是槓桿或反向 ETF，已標示為高風險" : ""}`,
    };
  }

  if (!ratio || !price) throw new Error("TWSE／TPEx 公開資料中找不到此代碼或最新價格");
  const pe = numeric(ratio.pe);
  const pb = numeric(ratio.pb);
  const eps = pe > 0 ? price / pe : 0;
  const bvps = pb > 0 ? price / pb : 0;
  if (!eps && !bvps) throw new Error("目前沒有足夠的本益比／淨值比資料可建立估值");
  const roe = bvps > 0 ? (eps / bvps) * 100 : 0;
  const targets = valuationTargets(0, roe, 0);

  return {
    ticker,
    name: body.capturedName?.trim() || ratio.name || quote?.name || ticker,
    market: "TW" as const,
    assetType: "EQUITY" as const,
    sector: ratio.exchange === "TWSE" ? "台灣上市公司" : "台灣上櫃公司",
    price,
    eps,
    bvps,
    fcfPerShare: 0,
    targetPe: targets.targetPe,
    targetPb: targets.targetPb,
    targetFcfMultiple: 0,
    revenueGrowth: 0,
    roe,
    debtRatio: 0,
    uncertainty: eps > 0 && bvps > 0 ? 0.3 : 0.36,
    qualityAvailable: false,
    updatedAt: formatTaiwanDate(ratio.date),
    source: "自動資料" as const,
    sourceNote: `收盤價、本益比與股價淨值比取自 ${ratio.exchange === "TWSE" ? "臺灣證券交易所" : "證券櫃檯買賣中心"} OpenAPI；因未取得現金流、營收成長與負債資料，僅作初步估值且不提供品質分數`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ValuationRequest;
    const ticker = String(body.ticker ?? "").trim().toUpperCase().replace(/\.(TW|TWO)$/, "");
    if (!ticker || !/^[A-Z0-9-]{1,10}$/.test(ticker)) {
      return NextResponse.json({ error: "股票代碼格式不正確" }, { status: 400 });
    }
    const market: Market = body.market ?? (/^\d/.test(ticker) ? "TW" : "US");
    const stock = market === "TW" ? await valueTwStock(body, ticker) : await valueUsStock(body, ticker);
    return NextResponse.json({ stock });
  } catch (error) {
    const message = error instanceof Error ? error.message : "暫時無法取得估值資料";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
