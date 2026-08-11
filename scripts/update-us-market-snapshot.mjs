import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const fiscalYear = new Date().getUTCFullYear() - 1;
const secHeaders = {
  Accept: "application/json",
  "User-Agent": "WenYing Value Radar fanhow@hotmail.com",
};
const browserHeaders = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
  "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)",
};

async function json(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function optionalFrame(url) {
  try {
    return await json(url, secHeaders);
  } catch (error) {
    console.warn(`Skipped optional SEC frame: ${error instanceof Error ? error.message : url}`);
    return { data: [] };
  }
}

const frameBase = "https://data.sec.gov/api/xbrl/frames";
const [
  tickers,
  epsFrame,
  equityFrame,
  sharesFrame,
  dilutedSharesFrame,
  dividendFrame,
  revenueFrame,
  revenuesFrame,
  salesFrame,
  priorRevenueFrame,
  priorRevenuesFrame,
  priorSalesFrame,
  operatingCashFrame,
  capexFrame,
  assetsFrame,
  liabilitiesFrame,
  nasdaq,
] = await Promise.all([
  json("https://www.sec.gov/files/company_tickers.json", secHeaders),
  json(`${frameBase}/us-gaap/EarningsPerShareDiluted/USD-per-shares/CY${fiscalYear}.json`, secHeaders),
  json(`${frameBase}/us-gaap/StockholdersEquity/USD/CY${fiscalYear}Q4I.json`, secHeaders),
  json(`${frameBase}/dei/EntityCommonStockSharesOutstanding/shares/CY${fiscalYear}Q4I.json`, secHeaders),
  optionalFrame(`${frameBase}/us-gaap/WeightedAverageNumberOfDilutedSharesOutstanding/shares/CY${fiscalYear}.json`),
  json(`${frameBase}/us-gaap/CommonStockDividendsPerShareDeclared/USD-per-shares/CY${fiscalYear}.json`, secHeaders),
  optionalFrame(`${frameBase}/us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax/USD/CY${fiscalYear}.json`),
  optionalFrame(`${frameBase}/us-gaap/Revenues/USD/CY${fiscalYear}.json`),
  optionalFrame(`${frameBase}/us-gaap/SalesRevenueNet/USD/CY${fiscalYear}.json`),
  optionalFrame(`${frameBase}/us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax/USD/CY${fiscalYear - 1}.json`),
  optionalFrame(`${frameBase}/us-gaap/Revenues/USD/CY${fiscalYear - 1}.json`),
  optionalFrame(`${frameBase}/us-gaap/SalesRevenueNet/USD/CY${fiscalYear - 1}.json`),
  optionalFrame(`${frameBase}/us-gaap/NetCashProvidedByUsedInOperatingActivities/USD/CY${fiscalYear}.json`),
  optionalFrame(`${frameBase}/us-gaap/PaymentsToAcquirePropertyPlantAndEquipment/USD/CY${fiscalYear}.json`),
  optionalFrame(`${frameBase}/us-gaap/Assets/USD/CY${fiscalYear}Q4I.json`),
  optionalFrame(`${frameBase}/us-gaap/Liabilities/USD/CY${fiscalYear}Q4I.json`),
  json("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true", browserHeaders),
]);

function latestByCik(rows) {
  const result = new Map();
  for (const row of rows ?? []) {
    const current = result.get(row.cik);
    if (!current || `${row.end ?? ""}${row.accn ?? ""}` > `${current.end ?? ""}${current.accn ?? ""}`) {
      result.set(row.cik, row);
    }
  }
  return result;
}

function mergeByPriority(...maps) {
  const result = new Map();
  for (const map of maps) {
    for (const [cik, row] of map) {
      if (!result.has(cik)) result.set(cik, row);
    }
  }
  return result;
}

function cleanSecurityName(name) {
  return String(name ?? "")
    .replace(/\s+(common stock|common shares|ordinary shares|class [a-z] common stock|class [a-z] ordinary shares)\s*$/i, "")
    .trim();
}

const tickerBySymbol = new Map(Object.values(tickers).map((row) => [row.ticker, row]));
const epsByCik = latestByCik(epsFrame.data);
const equityByCik = latestByCik(equityFrame.data);
const sharesByCik = mergeByPriority(latestByCik(sharesFrame.data), latestByCik(dilutedSharesFrame.data));
const dividendByCik = latestByCik(dividendFrame.data);
const revenueByCik = mergeByPriority(
  latestByCik(revenueFrame.data),
  latestByCik(revenuesFrame.data),
  latestByCik(salesFrame.data),
);
const priorRevenueByCik = mergeByPriority(
  latestByCik(priorRevenueFrame.data),
  latestByCik(priorRevenuesFrame.data),
  latestByCik(priorSalesFrame.data),
);
const operatingCashByCik = latestByCik(operatingCashFrame.data);
const capexByCik = latestByCik(capexFrame.data);
const assetsByCik = latestByCik(assetsFrame.data);
const liabilitiesByCik = latestByCik(liabilitiesFrame.data);

const snapshot = (nasdaq.data?.rows ?? []).flatMap((quote) => {
  if (/warrant|\bright\b|\bunit\b|preferred stock|preference share|notes due|\bbond\b|\betf\b|\bfund\b/i.test(quote.name ?? "")) return [];
  const ticker = tickerBySymbol.get(quote.symbol);
  if (!ticker) return [];
  const eps = Number(epsByCik.get(ticker.cik_str)?.val ?? 0);
  const equity = Number(equityByCik.get(ticker.cik_str)?.val ?? 0);
  const shares = Number(sharesByCik.get(ticker.cik_str)?.val ?? 0);
  const price = Number(String(quote.lastsale ?? "").replace(/[$,]/g, ""));
  const bvps = shares > 0 && equity > 0 ? equity / shares : 0;
  const revenue = Number(revenueByCik.get(ticker.cik_str)?.val ?? 0);
  const priorRevenue = Number(priorRevenueByCik.get(ticker.cik_str)?.val ?? 0);
  const operatingCash = Number(operatingCashByCik.get(ticker.cik_str)?.val ?? Number.NaN);
  const capex = Number(capexByCik.get(ticker.cik_str)?.val ?? Number.NaN);
  const assets = Number(assetsByCik.get(ticker.cik_str)?.val ?? 0);
  const reportedLiabilities = Number(liabilitiesByCik.get(ticker.cik_str)?.val ?? 0);
  const liabilities = reportedLiabilities > 0 ? reportedLiabilities : assets > equity && equity > 0 ? assets - equity : 0;
  const revenueGrowth = revenue > 0 && priorRevenue > 0
    ? ((revenue - priorRevenue) / Math.abs(priorRevenue)) * 100
    : null;
  const fcfPerShare = shares > 0 && Number.isFinite(operatingCash) && Number.isFinite(capex)
    ? (operatingCash - Math.abs(capex)) / shares
    : null;
  const debtRatio = assets > 0 && liabilities >= 0 ? (liabilities / assets) * 100 : null;
  if (!price || (!eps && !bvps)) return [];
  return [{
    ticker: quote.symbol,
    name: cleanSecurityName(quote.name),
    price,
    eps,
    bvps,
    revenueGrowth,
    fcfPerShare,
    debtRatio,
    dividendPerShare: Math.max(Number(dividendByCik.get(ticker.cik_str)?.val ?? 0), 0),
    marketCap: Number(String(quote.marketCap ?? "").replaceAll(",", "")) || 0,
    volume: Number(String(quote.volume ?? "").replaceAll(",", "")) || 0,
    sector: quote.sector || quote.industry || "U.S. listed company",
    date: epsByCik.get(ticker.cik_str)?.end || equityByCik.get(ticker.cik_str)?.end || `${fiscalYear}-12-31`,
  }];
});

const output = fileURLToPath(new URL("../lib/us-market-snapshot.json", import.meta.url));
await writeFile(output, `${JSON.stringify(snapshot)}\n`, "utf8");
console.log(`Saved ${snapshot.length} U.S. stocks to ${output}`);
