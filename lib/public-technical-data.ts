import {
  parseYahooCorporateActions,
  parseYahooDailyCandles,
  tradingViewSymbolFromYahoo,
  yahooHistorySymbols,
  type YahooChartPayload,
} from "./price-history.ts";
import { analyzeTechnicalSetup } from "./technical-analysis.ts";

export async function loadPublicTechnicalData(ticker: string, market: "TW" | "US", fetcher: typeof fetch = fetch) {
  for (const symbol of yahooHistorySymbols(ticker, market)) {
    try {
      const response = await fetcher(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5y&events=div%2Csplits`,
        {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)" },
          signal: AbortSignal.timeout(4_000),
        },
      );
      if (!response.ok) continue;
      const payload = await response.json() as YahooChartPayload;
      const allCandles = parseYahooDailyCandles(payload, 1_300);
      const tradingViewSymbol = tradingViewSymbolFromYahoo(payload, symbol);
      if (allCandles.length < 20 || !tradingViewSymbol) continue;
      return {
        ticker,
        market,
        symbol,
        tradingViewSymbol,
        candles: allCandles.slice(-120),
        corporateActions: parseYahooCorporateActions(payload),
        technicalAnalysis: analyzeTechnicalSetup(allCandles),
      };
    } catch {
      // Taiwan listed and OTC symbols use different Yahoo suffixes.
    }
  }
  return null;
}
