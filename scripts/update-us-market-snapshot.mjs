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

const frameBase = "https://data.sec.gov/api/xbrl/frames";
const [tickers, epsFrame, equityFrame, sharesFrame, dividendFrame, nasdaq] = await Promise.all([
  json("https://www.sec.gov/files/company_tickers.json", secHeaders),
  json(`${frameBase}/us-gaap/EarningsPerShareDiluted/USD-per-shares/CY${fiscalYear}.json`, secHeaders),
  json(`${frameBase}/us-gaap/StockholdersEquity/USD/CY${fiscalYear}Q4I.json`, secHeaders),
  json(`${frameBase}/dei/EntityCommonStockSharesOutstanding/shares/CY${fiscalYear}Q4I.json`, secHeaders),
  json(`${frameBase}/us-gaap/CommonStockDividendsPerShareDeclared/USD-per-shares/CY${fiscalYear}.json`, secHeaders),
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

function cleanSecurityName(name) {
  return String(name ?? "")
    .replace(/\s+(common stock|common shares|ordinary shares|class [a-z] common stock|class [a-z] ordinary shares)\s*$/i, "")
    .trim();
}

const tickerBySymbol = new Map(Object.values(tickers).map((row) => [row.ticker, row]));
const epsByCik = latestByCik(epsFrame.data);
const equityByCik = latestByCik(equityFrame.data);
const sharesByCik = latestByCik(sharesFrame.data);
const dividendByCik = latestByCik(dividendFrame.data);

const snapshot = (nasdaq.data?.rows ?? []).flatMap((quote) => {
  if (/warrant|\bright\b|\bunit\b|preferred stock|preference share|notes due|\bbond\b|\betf\b|\bfund\b/i.test(quote.name ?? "")) return [];
  const ticker = tickerBySymbol.get(quote.symbol);
  if (!ticker) return [];
  const eps = Number(epsByCik.get(ticker.cik_str)?.val ?? 0);
  const equity = Number(equityByCik.get(ticker.cik_str)?.val ?? 0);
  const shares = Number(sharesByCik.get(ticker.cik_str)?.val ?? 0);
  const price = Number(String(quote.lastsale ?? "").replace(/[$,]/g, ""));
  const bvps = shares > 0 && equity > 0 ? equity / shares : 0;
  if (!price || (!eps && !bvps)) return [];
  return [{
    ticker: quote.symbol,
    name: cleanSecurityName(quote.name),
    price,
    eps,
    bvps,
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
