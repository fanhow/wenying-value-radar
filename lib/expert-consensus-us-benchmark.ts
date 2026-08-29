export type ExpertConsensusUsBenchmarkRow = {
  rank: number;
  ticker: string;
  name: string;
  market: "US";
  price: number;
  fairValue: number;
  upside: number;
  financialHealthScore?: number;
  roe?: number;
  sector?: string;
};

export const EXPERT_CONSENSUS_US_BENCHMARK_AS_OF = "2026-08-30";
export const EXPERT_CONSENSUS_US_BENCHMARK_SOURCE = "user-authorized-expert-valuation-watchlist";

export const EXPERT_CONSENSUS_US_BENCHMARKS: readonly ExpertConsensusUsBenchmarkRow[] = [
  {
    "rank": 1,
    "ticker": "PYPL",
    "name": "PayPal Holdings Inc",
    "market": "US",
    "price": 53.66,
    "fairValue": 93.21,
    "upside": 0.737,
    "financialHealthScore": 2.62,
    "roe": 24.5,
    "sector": "Technology"
  },
  {
    "rank": 2,
    "ticker": "SMPL",
    "name": "The Simply Good Foods Company",
    "market": "US",
    "price": 10.93,
    "fairValue": 18.86,
    "upside": 0.725,
    "financialHealthScore": 2.37,
    "roe": -12.2,
    "sector": "Consumer Staples"
  },
  {
    "rank": 3,
    "ticker": "BRBR",
    "name": "BellRing Brands Inc",
    "market": "US",
    "price": 10.69,
    "fairValue": 18.39,
    "upside": 0.72,
    "financialHealthScore": 2.88,
    "sector": "Consumer Staples"
  },
  {
    "rank": 4,
    "ticker": "FISV",
    "name": "Fiserv Inc",
    "market": "US",
    "price": 53.18,
    "fairValue": 90.03,
    "upside": 0.693,
    "financialHealthScore": 2.29,
    "roe": 10.7,
    "sector": "Technology"
  },
  {
    "rank": 5,
    "ticker": "VISN",
    "name": "Visionary Holdings Inc",
    "market": "US",
    "price": 6.06,
    "fairValue": 10.22,
    "upside": 0.687,
    "financialHealthScore": 2.86,
    "roe": -1.6,
    "sector": "Technology"
  },
  {
    "rank": 6,
    "ticker": "GLOB",
    "name": "Globant SA",
    "market": "US",
    "price": 40.52,
    "fairValue": 66.68,
    "upside": 0.646,
    "financialHealthScore": 2.66,
    "roe": 5.4,
    "sector": "Technology"
  },
  {
    "rank": 7,
    "ticker": "EFOR",
    "name": "Energy Focus Inc",
    "market": "US",
    "price": 31.95,
    "fairValue": 52.02,
    "upside": 0.628,
    "financialHealthScore": 2.35,
    "roe": 4.6,
    "sector": "Industrials"
  },
  {
    "rank": 8,
    "ticker": "CHTR",
    "name": "Charter Communications Inc",
    "market": "US",
    "price": 153.82,
    "fairValue": 250.02,
    "upside": 0.627,
    "financialHealthScore": 2.45,
    "roe": 29.7,
    "sector": "Communication Services"
  },
  {
    "rank": 9,
    "ticker": "VRRM",
    "name": "Verra Mobility Corporation",
    "market": "US",
    "price": 4.39,
    "fairValue": 7.14,
    "upside": 0.626,
    "financialHealthScore": 2.56,
    "roe": 15.4,
    "sector": "Technology"
  },
  {
    "rank": 10,
    "ticker": "REAX",
    "name": "The Real Brokerage Inc.",
    "market": "US",
    "price": 21.09,
    "fairValue": 34.16,
    "upside": 0.62,
    "financialHealthScore": 2.63,
    "roe": -25.2,
    "sector": "Real Estate"
  },
  {
    "rank": 11,
    "ticker": "AMTM",
    "name": "Amentum Holdings Inc.",
    "market": "US",
    "price": 20.31,
    "fairValue": 32.82,
    "upside": 0.616,
    "financialHealthScore": 2.69,
    "roe": 4.5,
    "sector": "Industrials"
  },
  {
    "rank": 12,
    "ticker": "HELE",
    "name": "Helen of Troy Limited",
    "market": "US",
    "price": 28.62,
    "fairValue": 46,
    "upside": 0.607,
    "financialHealthScore": 2.07,
    "roe": -39.8,
    "sector": "Consumer Discretionary"
  },
  {
    "rank": 13,
    "ticker": "NRDS",
    "name": "NerdWallet Inc",
    "market": "US",
    "price": 9.9,
    "fairValue": 15.89,
    "upside": 0.605,
    "financialHealthScore": 3.25,
    "roe": 18.2,
    "sector": "Technology"
  },
  {
    "rank": 14,
    "ticker": "FIS",
    "name": "Fidelity National Information Services Inc",
    "market": "US",
    "price": 41.44,
    "fairValue": 66.28,
    "upside": 0.599,
    "financialHealthScore": 2.45,
    "roe": 22.3,
    "sector": "Technology"
  },
  {
    "rank": 15,
    "ticker": "EEFT",
    "name": "Euronet Worldwide Inc",
    "market": "US",
    "price": 69.95,
    "fairValue": 111.39,
    "upside": 0.592,
    "financialHealthScore": 2.41,
    "roe": 22.3,
    "sector": "Financials"
  },
  {
    "rank": 16,
    "ticker": "MMS",
    "name": "Maximus Inc",
    "market": "US",
    "price": 59.75,
    "fairValue": 94.97,
    "upside": 0.589,
    "financialHealthScore": 2.91,
    "roe": 21.1,
    "sector": "Industrials"
  },
  {
    "rank": 17,
    "ticker": "ACN",
    "name": "Accenture plc",
    "market": "US",
    "price": 189.61,
    "fairValue": 299.74,
    "upside": 0.581,
    "financialHealthScore": 2.95,
    "roe": 24.9,
    "sector": "Technology"
  },
  {
    "rank": 18,
    "ticker": "EPAM",
    "name": "EPAM Systems Inc",
    "market": "US",
    "price": 114.8,
    "fairValue": 180.72,
    "upside": 0.574,
    "financialHealthScore": 2.93,
    "roe": 11.2,
    "sector": "Technology"
  },
  {
    "rank": 19,
    "ticker": "OTEX",
    "name": "Open Text Corporation",
    "market": "US",
    "price": 25.1,
    "fairValue": 39.3,
    "upside": 0.566,
    "financialHealthScore": 2.85,
    "roe": 16.2,
    "sector": "Technology"
  },
  {
    "rank": 20,
    "ticker": "WOLF",
    "name": "Wolfspeed Inc",
    "market": "US",
    "price": 25.85,
    "fairValue": 40.36,
    "upside": 0.561,
    "financialHealthScore": 1.81,
    "roe": 0.9,
    "sector": "Technology"
  },
  {
    "rank": 21,
    "ticker": "APTV",
    "name": "Aptiv PLC",
    "market": "US",
    "price": 45.75,
    "fairValue": 71.36,
    "upside": 0.56,
    "financialHealthScore": 2.31,
    "roe": 5.1,
    "sector": "Consumer Discretionary"
  },
  {
    "rank": 22,
    "ticker": "BLKB",
    "name": "Blackbaud Inc",
    "market": "US",
    "price": 48.62,
    "fairValue": 75.65,
    "upside": 0.556,
    "financialHealthScore": 2.84,
    "roe": 194.4,
    "sector": "Technology"
  },
  {
    "rank": 23,
    "ticker": "PPLI",
    "name": "PPLI",
    "market": "US",
    "price": 39.14,
    "fairValue": 60.88,
    "upside": 0.555,
    "financialHealthScore": 2.48,
    "roe": 9.1,
    "sector": "Technology"
  },
  {
    "rank": 24,
    "ticker": "MBLY",
    "name": "Mobileye Global Inc",
    "market": "US",
    "price": 8.58,
    "fairValue": 13.3,
    "upside": 0.55,
    "financialHealthScore": 1.93,
    "roe": -40.1,
    "sector": "Technology"
  },
  {
    "rank": 25,
    "ticker": "STNE",
    "name": "StoneCo Ltd",
    "market": "US",
    "price": 9.71,
    "fairValue": 14.94,
    "upside": 0.539,
    "financialHealthScore": 2.9,
    "roe": 33.9,
    "sector": "Technology"
  },
  {
    "rank": 26,
    "ticker": "CI",
    "name": "The Cigna Group",
    "market": "US",
    "price": 278.88,
    "fairValue": 428.38,
    "upside": 0.536,
    "financialHealthScore": 3.15,
    "roe": 15.5,
    "sector": "Health Care"
  },
  {
    "rank": 27,
    "ticker": "TRIP",
    "name": "Tripadvisor Inc",
    "market": "US",
    "price": 9.87,
    "fairValue": 15.16,
    "upside": 0.536,
    "financialHealthScore": 2.32,
    "roe": -0.2,
    "sector": "Communication Services"
  },
  {
    "rank": 28,
    "ticker": "TLRY",
    "name": "Tilray Brands Inc",
    "market": "US",
    "price": 4.59,
    "fairValue": 7.02,
    "upside": 0.53,
    "financialHealthScore": 2.47,
    "roe": -7.8,
    "sector": "Health Care"
  },
  {
    "rank": 29,
    "ticker": "DOX",
    "name": "Amdocs Limited",
    "market": "US",
    "price": 62.91,
    "fairValue": 96.07,
    "upside": 0.527,
    "financialHealthScore": 2.75,
    "roe": 13.4,
    "sector": "Technology"
  },
  {
    "rank": 30,
    "ticker": "CDNL",
    "name": "Cardinal Infrastructure",
    "market": "US",
    "price": 38.04,
    "fairValue": 57.92,
    "upside": 0.523,
    "financialHealthScore": 2.74,
    "roe": -2.8,
    "sector": "Industrials"
  },
  {
    "rank": 31,
    "ticker": "OWL",
    "name": "Blue Owl Capital Inc",
    "market": "US",
    "price": 12.02,
    "fairValue": 18.29,
    "upside": 0.521,
    "financialHealthScore": 2.68,
    "roe": 3.7,
    "sector": "Finance"
  },
  {
    "rank": 32,
    "ticker": "MWH",
    "name": "MWH",
    "market": "US",
    "price": 26.29,
    "fairValue": 39.99,
    "upside": 0.521,
    "financialHealthScore": 2.62,
    "roe": 24,
    "sector": "Energy"
  },
  {
    "rank": 33,
    "ticker": "INTU",
    "name": "Intuit Inc",
    "market": "US",
    "price": 358.06,
    "fairValue": 543.8,
    "upside": 0.519,
    "financialHealthScore": 3.16,
    "roe": 23.6,
    "sector": "Technology"
  },
  {
    "rank": 34,
    "ticker": "ADBE",
    "name": "Adobe Inc",
    "market": "US",
    "price": 291.52,
    "fairValue": 441.68,
    "upside": 0.515,
    "financialHealthScore": 3.18,
    "roe": 63,
    "sector": "Technology"
  },
  {
    "rank": 35,
    "ticker": "BBWI",
    "name": "Bath & Body Works Inc",
    "market": "US",
    "price": 19.22,
    "fairValue": 29.11,
    "upside": 0.515,
    "financialHealthScore": 2.74,
    "sector": "Consumer Discretionary"
  },
  {
    "rank": 36,
    "ticker": "SPSC",
    "name": "SPS Commerce Inc",
    "market": "US",
    "price": 84.92,
    "fairValue": 127.97,
    "upside": 0.507,
    "financialHealthScore": 3.26,
    "roe": 8.3,
    "sector": "Technology"
  },
  {
    "rank": 37,
    "ticker": "HRMY",
    "name": "Harmony Biosciences Holdings Inc",
    "market": "US",
    "price": 39.21,
    "fairValue": 59.05,
    "upside": 0.506,
    "financialHealthScore": 3.84,
    "roe": 20.5,
    "sector": "Health Care"
  },
  {
    "rank": 38,
    "ticker": "GROY",
    "name": "Gold Royalty Corp",
    "market": "US",
    "price": 3.32,
    "fairValue": 4.88,
    "upside": 0.5,
    "financialHealthScore": 2.84,
    "roe": 0.2,
    "sector": "Basic Materials"
  },
  {
    "rank": 39,
    "ticker": "UPBD",
    "name": "Upbound Group Inc",
    "market": "US",
    "price": 19.22,
    "fairValue": 28.82,
    "upside": 0.499,
    "financialHealthScore": 2.83,
    "roe": 12.7,
    "sector": "Consumer Discretionary"
  },
  {
    "rank": 40,
    "ticker": "UAA",
    "name": "Under Armour Inc",
    "market": "US",
    "price": 5.08,
    "fairValue": 7.61,
    "upside": 0.499,
    "financialHealthScore": 1.47,
    "roe": -29.8,
    "sector": "Consumer Discretionary"
  }
];

export const EXPERT_CONSENSUS_US_TICKER_ORDER = EXPERT_CONSENSUS_US_BENCHMARKS.map((row) => row.ticker);
export const EXPERT_CONSENSUS_US_TICKERS = new Set(EXPERT_CONSENSUS_US_TICKER_ORDER);

const US_BENCHMARK_BY_TICKER = new Map(EXPERT_CONSENSUS_US_BENCHMARKS.map((row) => [row.ticker, row]));

export function expertConsensusUsBenchmarkForTicker(ticker: unknown, market: unknown) {
  if (String(market).trim().toUpperCase() !== "US") return undefined;
  return US_BENCHMARK_BY_TICKER.get(String(ticker).trim().toUpperCase());
}
