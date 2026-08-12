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
  netIncomeFrame,
  operatingIncomeFrame,
  depreciationAndAmortizationFrame,
  depreciationPpeFrame,
  depreciationFrame,
  cashFrame,
  cashIncludingRestrictedFrame,
  shortTermInvestmentsFrame,
  currentMarketableSecuritiesFrame,
  debtCurrentFrame,
  longTermDebtCurrentFrame,
  shortTermBorrowingsFrame,
  longTermDebtNoncurrentFrame,
  longTermDebtFrame,
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
  optionalFrame(`${frameBase}/us-gaap/NetIncomeLoss/USD/CY${fiscalYear}.json`),
  optionalFrame(`${frameBase}/us-gaap/OperatingIncomeLoss/USD/CY${fiscalYear}.json`),
  optionalFrame(`${frameBase}/us-gaap/DepreciationDepletionAndAmortization/USD/CY${fiscalYear}.json`),
  optionalFrame(`${frameBase}/us-gaap/DepreciationDepletionAndAmortizationPropertyPlantAndEquipment/USD/CY${fiscalYear}.json`),
  optionalFrame(`${frameBase}/us-gaap/Depreciation/USD/CY${fiscalYear}.json`),
  optionalFrame(`${frameBase}/us-gaap/CashAndCashEquivalentsAtCarryingValue/USD/CY${fiscalYear}Q4I.json`),
  optionalFrame(`${frameBase}/us-gaap/CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents/USD/CY${fiscalYear}Q4I.json`),
  optionalFrame(`${frameBase}/us-gaap/ShortTermInvestments/USD/CY${fiscalYear}Q4I.json`),
  optionalFrame(`${frameBase}/us-gaap/MarketableSecuritiesCurrent/USD/CY${fiscalYear}Q4I.json`),
  optionalFrame(`${frameBase}/us-gaap/DebtCurrent/USD/CY${fiscalYear}Q4I.json`),
  optionalFrame(`${frameBase}/us-gaap/LongTermDebtCurrent/USD/CY${fiscalYear}Q4I.json`),
  optionalFrame(`${frameBase}/us-gaap/ShortTermBorrowings/USD/CY${fiscalYear}Q4I.json`),
  optionalFrame(`${frameBase}/us-gaap/LongTermDebtNoncurrent/USD/CY${fiscalYear}Q4I.json`),
  optionalFrame(`${frameBase}/us-gaap/LongTermDebt/USD/CY${fiscalYear}Q4I.json`),
  json("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true", browserHeaders),
]);

// Keep a short public EPS history alongside the current annual snapshot.  It
// is used only to detect cyclical outliers; it is never a forward estimate.
const epsHistoryFrames = await Promise.all(
  [fiscalYear, fiscalYear - 1, fiscalYear - 2, fiscalYear - 3, fiscalYear - 4]
    .map((year) => optionalFrame(`${frameBase}/us-gaap/EarningsPerShareDiluted/USD-per-shares/CY${year}.json`)),
);

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
const epsHistoryByCik = new Map();
for (const frame of epsHistoryFrames) {
  for (const row of frame.data ?? []) {
    const value = optionalValue(row);
    if (value === null || !row?.cik || !row?.end) continue;
    const history = epsHistoryByCik.get(row.cik) ?? [];
    if (!history.some((point) => point.end === row.end)) {
      history.push({ value, start: row.start, end: row.end, basis: "annual" });
    }
    epsHistoryByCik.set(row.cik, history);
  }
}
for (const history of epsHistoryByCik.values()) {
  history.sort((left, right) => right.end.localeCompare(left.end));
  history.splice(5);
}
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
const netIncomeByCik = latestByCik(netIncomeFrame.data);
const operatingIncomeByCik = latestByCik(operatingIncomeFrame.data);
const depreciationAndAmortizationByCik = mergeByPriority(
  latestByCik(depreciationAndAmortizationFrame.data),
  latestByCik(depreciationPpeFrame.data),
  latestByCik(depreciationFrame.data),
);
const cashByCik = mergeByPriority(
  latestByCik(cashFrame.data),
  latestByCik(cashIncludingRestrictedFrame.data),
);
const shortTermInvestmentsByCik = mergeByPriority(
  latestByCik(shortTermInvestmentsFrame.data),
  latestByCik(currentMarketableSecuritiesFrame.data),
);
const currentDebtByCik = mergeByPriority(
  latestByCik(debtCurrentFrame.data),
  latestByCik(longTermDebtCurrentFrame.data),
  latestByCik(shortTermBorrowingsFrame.data),
);
const noncurrentDebtByCik = latestByCik(longTermDebtNoncurrentFrame.data);
const totalDebtByCik = latestByCik(longTermDebtFrame.data);

function optionalValue(row) {
  if (row?.val === null || row?.val === undefined) return null;
  const value = Number(row.val);
  return Number.isFinite(value) ? value : null;
}

function optionalPerShare(value, shares) {
  return value !== null && shares > 0 ? value / shares : null;
}

function sumAvailable(...values) {
  const available = values.filter((value) => value !== null && Number.isFinite(value));
  return available.length > 0 ? available.reduce((sum, value) => sum + value, 0) : null;
}

function rowsShareEnd(...rows) {
  return rows.length > 0
    && rows.every((row) => row?.end)
    && rows.every((row) => row.end === rows[0].end);
}

function latestDate(...rows) {
  const dates = rows.map((row) => row?.end).filter(Boolean).sort();
  return dates.at(-1) ?? null;
}

const snapshot = (nasdaq.data?.rows ?? []).flatMap((quote) => {
  if (/warrant|\bright\b|\bunit\b|preferred stock|preference share|notes due|\bbond\b|\betf\b|\bfund\b/i.test(quote.name ?? "")) return [];
  const ticker = tickerBySymbol.get(quote.symbol);
  if (!ticker) return [];
  const eps = Number(epsByCik.get(ticker.cik_str)?.val ?? 0);
  const equity = Number(equityByCik.get(ticker.cik_str)?.val ?? 0);
  const shares = Number(sharesByCik.get(ticker.cik_str)?.val ?? 0);
  const price = Number(String(quote.lastsale ?? "").replace(/[$,]/g, ""));
  const bvps = shares > 0 && equity > 0 ? equity / shares : 0;
  const revenueRow = revenueByCik.get(ticker.cik_str);
  const revenueValue = optionalValue(revenueRow);
  const revenue = revenueValue ?? 0;
  const priorRevenue = Number(priorRevenueByCik.get(ticker.cik_str)?.val ?? 0);
  const operatingCash = Number(operatingCashByCik.get(ticker.cik_str)?.val ?? Number.NaN);
  const capex = Number(capexByCik.get(ticker.cik_str)?.val ?? Number.NaN);
  const assetsRow = assetsByCik.get(ticker.cik_str);
  const assetsValue = optionalValue(assetsRow);
  const assets = assetsValue ?? 0;
  const reportedLiabilities = Number(liabilitiesByCik.get(ticker.cik_str)?.val ?? 0);
  const liabilities = reportedLiabilities > 0 ? reportedLiabilities : assets > equity && equity > 0 ? assets - equity : 0;
  const netIncomeRow = netIncomeByCik.get(ticker.cik_str);
  const netIncome = optionalValue(netIncomeRow);
  const operatingIncomeRow = operatingIncomeByCik.get(ticker.cik_str);
  const operatingIncome = optionalValue(operatingIncomeRow);
  const depreciationRow = depreciationAndAmortizationByCik.get(ticker.cik_str);
  const depreciationAndAmortization = optionalValue(depreciationRow);
  const cashRow = cashByCik.get(ticker.cik_str);
  const shortTermInvestmentsRow = shortTermInvestmentsByCik.get(ticker.cik_str);
  const cashAndInvestments = sumAvailable(
    optionalValue(cashRow),
    optionalValue(shortTermInvestmentsRow),
  );
  const currentDebtRow = currentDebtByCik.get(ticker.cik_str);
  const noncurrentDebtRow = noncurrentDebtByCik.get(ticker.cik_str);
  const totalDebtRow = totalDebtByCik.get(ticker.cik_str);
  // LongTermDebt already includes the current portion. Prefer that complete total;
  // only add the disjoint current/noncurrent components when no total is reported.
  const debt = optionalValue(totalDebtRow) ?? sumAvailable(
    optionalValue(currentDebtRow),
    optionalValue(noncurrentDebtRow),
  );
  const ebitda = rowsShareEnd(operatingIncomeRow, depreciationRow)
    && operatingIncome !== null
    && depreciationAndAmortization !== null
    ? operatingIncome + depreciationAndAmortization
    : null;
  const financialDataDate = latestDate(
    revenueRow,
    netIncomeRow,
    operatingIncomeRow,
    operatingCashByCik.get(ticker.cik_str),
    assetsRow,
    equityByCik.get(ticker.cik_str),
  );
  const revenueGrowth = revenue > 0 && priorRevenue > 0
    ? ((revenue - priorRevenue) / Math.abs(priorRevenue)) * 100
    : null;
  const fcfPerShare = shares > 0
    && rowsShareEnd(operatingCashByCik.get(ticker.cik_str), capexByCik.get(ticker.cik_str))
    && Number.isFinite(operatingCash)
    && Number.isFinite(capex)
    ? (operatingCash - Math.abs(capex)) / shares
    : null;
  const debtRatio = assets > 0 && liabilities >= 0 ? (liabilities / assets) * 100 : null;
  if (!price || (!eps && !bvps)) return [];
  return [{
    ticker: quote.symbol,
    name: cleanSecurityName(quote.name),
    price,
    eps,
    epsHistory: (epsHistoryByCik.get(ticker.cik_str) ?? []).length >= 3
      ? epsHistoryByCik.get(ticker.cik_str)
      : undefined,
    bvps,
    revenueGrowth,
    fcfPerShare,
    debtRatio,
    revenuePerShare: optionalPerShare(revenueValue, shares),
    ebitPerShare: optionalPerShare(operatingIncome, shares),
    ebitdaPerShare: optionalPerShare(ebitda, shares),
    cashPerShare: optionalPerShare(cashAndInvestments, shares),
    debtPerShare: optionalPerShare(debt, shares),
    netMargin: rowsShareEnd(revenueRow, netIncomeRow)
      && revenueValue !== null
      && revenueValue !== 0
      && netIncome !== null
      ? (netIncome / revenueValue) * 100
      : null,
    assetTurnover: rowsShareEnd(revenueRow, assetsRow)
      && revenueValue !== null
      && assetsValue !== null
      && assetsValue !== 0
      ? revenueValue / Math.abs(assetsValue)
      : null,
    financialLeverage: rowsShareEnd(assetsRow, equityByCik.get(ticker.cik_str))
      && assetsValue !== null
      && equity !== 0
      ? Math.abs(assetsValue / equity)
      : null,
    dataBasis: "annual",
    financialDataDate,
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
