export type ExpertConsensusBenchmarkRow = {
  rank: number;
  ticker: string;
  name: string;
  market: "TW" | "HK";
  exchange: "TWSE" | "TPEx" | "SEHK";
  fairValue: number;
};

export const EXPERT_CONSENSUS_TW_BENCHMARK_AS_OF = "2026-08-30";
export const EXPERT_CONSENSUS_TW_BENCHMARK_SOURCE = "user-authorized-expert-valuation-watchlist";

// User-authorized expert valuation benchmark. Hong Kong listings remain in
// the audit set, but only Taiwan listings are eligible for the Taiwan ranking.
export const EXPERT_CONSENSUS_TW_BENCHMARKS: readonly ExpertConsensusBenchmarkRow[] = [
  { rank: 1, ticker: "2890", name: "永豐金", market: "TW", exchange: "TWSE", fairValue: 79.24 },
  { rank: 2, ticker: "2072", name: "世紀風電", market: "TW", exchange: "TWSE", fairValue: 223.41 },
  { rank: 3, ticker: "8454", name: "富邦媒", market: "TW", exchange: "TWSE", fairValue: 377.19 },
  { rank: 4, ticker: "4961", name: "天鈺", market: "TW", exchange: "TWSE", fairValue: 241.29 },
  { rank: 5, ticker: "2354", name: "鴻準", market: "TW", exchange: "TWSE", fairValue: 95.71 },
  { rank: 6, ticker: "3515", name: "華擎", market: "TW", exchange: "TWSE", fairValue: 324.70 },
  { rank: 7, ticker: "1402", name: "遠東新", market: "TW", exchange: "TWSE", fairValue: 40.84 },
  { rank: 8, ticker: "2539", name: "櫻花建", market: "TW", exchange: "TWSE", fairValue: 49.88 },
  { rank: 9, ticker: "1736", name: "喬山", market: "TW", exchange: "TWSE", fairValue: 182.12 },
  { rank: 10, ticker: "2704", name: "國賓", market: "TW", exchange: "TWSE", fairValue: 65.50 },
  { rank: 11, ticker: "9910", name: "豐泰", market: "TW", exchange: "TWSE", fairValue: 98.44 },
  { rank: 12, ticker: "9907", name: "統一實", market: "TW", exchange: "TWSE", fairValue: 22.10 },
  { rank: 13, ticker: "3033", name: "威健", market: "TW", exchange: "TWSE", fairValue: 64.50 },
  { rank: 14, ticker: "2474", name: "可成", market: "TW", exchange: "TWSE", fairValue: 294.49 },
  { rank: 15, ticker: "7722", name: "LINEPAY", market: "TW", exchange: "TWSE", fairValue: 413.20 },
  { rank: 16, ticker: "2385", name: "群光", market: "TW", exchange: "TWSE", fairValue: 153.87 },
  { rank: 17, ticker: "1102", name: "亞泥", market: "TW", exchange: "TWSE", fairValue: 48.80 },
  { rank: 18, ticker: "2439", name: "美律", market: "TW", exchange: "TWSE", fairValue: 110.74 },
  { rank: 19, ticker: "2371", name: "大同", market: "TW", exchange: "TWSE", fairValue: 40.20 },
  { rank: 20, ticker: "6757", name: "台灣虎航", market: "TW", exchange: "TWSE", fairValue: 77.70 },
  { rank: 21, ticker: "2510", name: "德翔海運", market: "HK", exchange: "SEHK", fairValue: 19.31 },
  { rank: 22, ticker: "8131", name: "福懋科", market: "TW", exchange: "TWSE", fairValue: 88.04 },
  { rank: 23, ticker: "4915", name: "致伸", market: "TW", exchange: "TWSE", fairValue: 83.67 },
  { rank: 24, ticker: "2727", name: "王品", market: "TW", exchange: "TWSE", fairValue: 323.22 },
  { rank: 25, ticker: "6176", name: "瑞儀", market: "TW", exchange: "TWSE", fairValue: 128.21 },
  { rank: 26, ticker: "1476", name: "儒鴻", market: "TW", exchange: "TWSE", fairValue: 428.19 },
  { rank: 27, ticker: "5443", name: "均豪", market: "TW", exchange: "TPEx", fairValue: 153.93 },
  { rank: 28, ticker: "2451", name: "創見", market: "TW", exchange: "TWSE", fairValue: 403.78 },
  { rank: 29, ticker: "4938", name: "和碩", market: "TW", exchange: "TWSE", fairValue: 120.96 },
  { rank: 30, ticker: "3592", name: "瑞鼎", market: "TW", exchange: "TWSE", fairValue: 310.25 },
  { rank: 31, ticker: "0425", name: "敏實集團", market: "HK", exchange: "SEHK", fairValue: 36.62 },
  { rank: 32, ticker: "5469", name: "瀚宇博", market: "TW", exchange: "TWSE", fairValue: 101.75 },
  { rank: 33, ticker: "2618", name: "長榮航", market: "TW", exchange: "TWSE", fairValue: 56.59 },
  { rank: 34, ticker: "3036", name: "文曄", market: "TW", exchange: "TWSE", fairValue: 264.56 },
  { rank: 35, ticker: "1795", name: "美時", market: "TW", exchange: "TWSE", fairValue: 260.42 },
  { rank: 36, ticker: "3227", name: "原相", market: "TW", exchange: "TPEx", fairValue: 264.22 },
  { rank: 37, ticker: "1301", name: "台塑", market: "TW", exchange: "TWSE", fairValue: 83.81 },
  { rank: 38, ticker: "7749", name: "意騰-KY", market: "TW", exchange: "TWSE", fairValue: 495.57 },
  { rank: 39, ticker: "2520", name: "冠德", market: "TW", exchange: "TWSE", fairValue: 46.97 },
  { rank: 40, ticker: "6121", name: "新普", market: "TW", exchange: "TPEx", fairValue: 538.91 },
];

export const EXPERT_CONSENSUS_TAIWAN_BENCHMARKS = EXPERT_CONSENSUS_TW_BENCHMARKS.filter((row) => row.market === "TW");
export const EXPERT_CONSENSUS_TAIWAN_TICKER_ORDER = EXPERT_CONSENSUS_TAIWAN_BENCHMARKS.map((row) => row.ticker);

export const EXPERT_CONSENSUS_TW_BULLISH_BENCHMARKS = EXPERT_CONSENSUS_TW_BENCHMARKS;
export const EXPERT_CONSENSUS_TW_BULLISH_TICKER_ORDER = EXPERT_CONSENSUS_TAIWAN_TICKER_ORDER;

export const EXPERT_CONSENSUS_TW_BEARISH_BENCHMARKS: readonly ExpertConsensusBenchmarkRow[] = [
  { rank: 1, ticker: "5475", name: "德宏", market: "TW", exchange: "TPEx", fairValue: 89.99 },
  { rank: 2, ticker: "8021", name: "尖點", market: "TW", exchange: "TWSE", fairValue: 200.60 },
  { rank: 3, ticker: "3081", name: "聯亞", market: "TW", exchange: "TPEx", fairValue: 1645.87 },
  { rank: 4, ticker: "2426", name: "鼎元", market: "TW", exchange: "TWSE", fairValue: 50.96 },
  { rank: 5, ticker: "8039", name: "台虹", market: "TW", exchange: "TWSE", fairValue: 152.88 },
  { rank: 6, ticker: "6530", name: "創威", market: "TW", exchange: "TPEx", fairValue: 92.01 },
  { rank: 7, ticker: "6920", name: "晶呈科技", market: "TW", exchange: "TPEx", fairValue: 49.16 },
  { rank: 8, ticker: "4979", name: "華星光", market: "TW", exchange: "TPEx", fairValue: 107.72 },
  { rank: 9, ticker: "6949", name: "沛爾生醫", market: "TW", exchange: "TWSE", fairValue: 765.35 },
  { rank: 10, ticker: "3587", name: "閎康", market: "TW", exchange: "TPEx", fairValue: 297.53 },
  { rank: 11, ticker: "3163", name: "波若威", market: "TW", exchange: "TPEx", fairValue: 395.61 },
  { rank: 12, ticker: "4764", name: "雙鍵", market: "TW", exchange: "TWSE", fairValue: 134.05 },
  { rank: 13, ticker: "4722", name: "國精化", market: "TW", exchange: "TWSE", fairValue: 114.55 },
  { rank: 14, ticker: "3532", name: "台勝科", market: "TW", exchange: "TWSE", fairValue: 223.78 },
  { rank: 15, ticker: "6715", name: "嘉基", market: "TW", exchange: "TWSE", fairValue: 187.13 },
  { rank: 16, ticker: "6217", name: "中探針", market: "TW", exchange: "TWSE", fairValue: 96.29 },
  { rank: 17, ticker: "2455", name: "全新", market: "TW", exchange: "TWSE", fairValue: 292.99 },
  { rank: 18, ticker: "1711", name: "永光", market: "TW", exchange: "TWSE", fairValue: 24.72 },
  { rank: 19, ticker: "2466", name: "冠西電", market: "TW", exchange: "TWSE", fairValue: 58.06 },
  { rank: 20, ticker: "3026", name: "禾伸堂", market: "TW", exchange: "TWSE", fairValue: 430.69 },
  { rank: 21, ticker: "3443", name: "創意", market: "TW", exchange: "TWSE", fairValue: 3535.35 },
  { rank: 22, ticker: "2489", name: "瑞軒", market: "TW", exchange: "TWSE", fairValue: 25.57 },
  { rank: 23, ticker: "6173", name: "信昌電", market: "TW", exchange: "TPEx", fairValue: 147.09 },
  { rank: 24, ticker: "6182", name: "合晶", market: "TW", exchange: "TPEx", fairValue: 63.14 },
  { rank: 25, ticker: "7610", name: "聯友金屬", market: "TW", exchange: "TWSE", fairValue: 964.40 },
  { rank: 26, ticker: "8028", name: "昇陽半導體", market: "TW", exchange: "TWSE", fairValue: 154.78 },
  { rank: 27, ticker: "8033", name: "雷虎", market: "TW", exchange: "TWSE", fairValue: 114.40 },
  { rank: 28, ticker: "6739", name: "竹陞科技", market: "TW", exchange: "TPEx", fairValue: 719.08 },
  { rank: 29, ticker: "8064", name: "東捷", market: "TW", exchange: "TPEx", fairValue: 62.78 },
  { rank: 30, ticker: "3362", name: "先進光", market: "TW", exchange: "TPEx", fairValue: 127.75 },
  { rank: 31, ticker: "6683", name: "雍智科技", market: "TW", exchange: "TPEx", fairValue: 787.93 },
  { rank: 32, ticker: "7788", name: "松川精密", market: "TW", exchange: "TWSE", fairValue: 209.43 },
  { rank: 33, ticker: "1560", name: "中砂", market: "TW", exchange: "TWSE", fairValue: 487.01 },
  { rank: 34, ticker: "3105", name: "穩懋", market: "TW", exchange: "TPEx", fairValue: 293.37 },
  { rank: 35, ticker: "6425", name: "易發", market: "TW", exchange: "TPEx", fairValue: 118.46 },
  { rank: 36, ticker: "3374", name: "精材", market: "TW", exchange: "TPEx", fairValue: 280.30 },
  { rank: 37, ticker: "6488", name: "環球晶", market: "TW", exchange: "TPEx", fairValue: 606.13 },
  { rank: 38, ticker: "3595", name: "智晶", market: "TW", exchange: "TPEx", fairValue: 1193.99 },
  { rank: 39, ticker: "2467", name: "志聖", market: "TW", exchange: "TWSE", fairValue: 416.24 },
  { rank: 40, ticker: "1717", name: "長興", market: "TW", exchange: "TWSE", fairValue: 56.56 },
];

export const EXPERT_CONSENSUS_TAIWAN_BEARISH_TICKER_ORDER = EXPERT_CONSENSUS_TW_BEARISH_BENCHMARKS.map((row) => row.ticker);
export const EXPERT_CONSENSUS_TAIWAN_ALL_BENCHMARKS = [
  ...EXPERT_CONSENSUS_TAIWAN_BENCHMARKS,
  ...EXPERT_CONSENSUS_TW_BEARISH_BENCHMARKS,
];

export const EXPERT_CONSENSUS_TAIWAN_TICKERS = new Set(EXPERT_CONSENSUS_TAIWAN_ALL_BENCHMARKS.map((row) => row.ticker));

const TAIWAN_BENCHMARK_BY_TICKER = new Map(EXPERT_CONSENSUS_TAIWAN_ALL_BENCHMARKS.map((row) => [row.ticker, row]));

export function expertConsensusTaiwanBenchmarkForTicker(ticker: unknown, market: unknown) {
  if (String(market).trim().toUpperCase() !== "TW") return undefined;
  return TAIWAN_BENCHMARK_BY_TICKER.get(String(ticker).trim().toUpperCase());
}
