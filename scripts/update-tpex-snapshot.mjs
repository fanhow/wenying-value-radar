import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const endpoints = [
  "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes",
  "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis",
];

const [quotesResponse, ratiosResponse] = await Promise.all(endpoints.map((url) => fetch(url)));
if (!quotesResponse.ok || !ratiosResponse.ok) {
  throw new Error(`TPEx snapshot failed: quotes=${quotesResponse.status}, ratios=${ratiosResponse.status}`);
}

const [quotes, ratios] = await Promise.all([quotesResponse.json(), ratiosResponse.json()]);
const ratiosByTicker = new Map(ratios.map((row) => [row.SecuritiesCompanyCode, row]));
const snapshot = quotes.map((quote) => {
  const ratio = ratiosByTicker.get(quote.SecuritiesCompanyCode);
  return {
    ticker: quote.SecuritiesCompanyCode,
    name: quote.CompanyName,
    close: quote.Close,
    date: quote.Date,
    pe: ratio?.PriceEarningRatio ?? "",
    pb: ratio?.PriceBookRatio ?? "",
    volume: quote.TradingShares ?? "",
  };
});

const output = fileURLToPath(new URL("../lib/tpex-snapshot.json", import.meta.url));
await writeFile(output, `${JSON.stringify(snapshot)}\n`, "utf8");
console.log(`Saved ${snapshot.length} TPEx symbols to ${output}`);
