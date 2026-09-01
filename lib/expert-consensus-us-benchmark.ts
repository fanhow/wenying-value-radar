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

export const EXPERT_CONSENSUS_US_BULLISH_BENCHMARKS = EXPERT_CONSENSUS_US_BENCHMARKS;
export const EXPERT_CONSENSUS_US_BULLISH_TICKER_ORDER = EXPERT_CONSENSUS_US_BENCHMARKS.map((row) => row.ticker);

export const EXPERT_CONSENSUS_US_BEARISH_BENCHMARKS: readonly ExpertConsensusUsBenchmarkRow[] = [
  { rank: 1, ticker: "TOP", name: "TOP Financial Group Limited", market: "US", price: 16.63, fairValue: 7.92, upside: -0.524, financialHealthScore: 2.36, sector: "Financials" },
  { rank: 2, ticker: "RGC", name: "Regencell Bioscience Holdings Limited", market: "US", price: 5.51, fairValue: 2.64, upside: -0.520, financialHealthScore: 1.76, sector: "Healthcare" },
  { rank: 3, ticker: "GFUZ", name: "GFUZ (Future Data Group)", market: "US", price: 8.10, fairValue: 3.92, upside: -0.516, financialHealthScore: 0.97, sector: "Technology" },
  { rank: 4, ticker: "SGLA", name: "Singularity Future Technology Ltd", market: "US", price: 9.10, fairValue: 4.45, upside: -0.511, financialHealthScore: 1.76, sector: "Industrials" },
  { rank: 5, ticker: "PL", name: "Planet Labs PBC", market: "US", price: 19.85, fairValue: 10.54, upside: -0.469, financialHealthScore: 1.95, sector: "Technology" },
  { rank: 6, ticker: "PBT", name: "Permian Basin Royalty Trust", market: "US", price: 33.77, fairValue: 18.38, upside: -0.456, financialHealthScore: 2.68, sector: "Energy" },
  { rank: 7, ticker: "SYRE", name: "Spyre Therapeutics, Inc.", market: "US", price: 89.33, fairValue: 49.25, upside: -0.449, financialHealthScore: 2.31, sector: "Healthcare" },
  { rank: 8, ticker: "MGRT", name: "MGRT", market: "US", price: 98.07, fairValue: 54.34, upside: -0.446, financialHealthScore: 2.93, sector: "Technology" },
  { rank: 9, ticker: "RKLB", name: "Rocket Lab USA, Inc.", market: "US", price: 63.92, fairValue: 35.43, upside: -0.446, financialHealthScore: 1.92, sector: "Industrials" },
  { rank: 10, ticker: "XMAX", name: "XMAX", market: "US", price: 8.97, fairValue: 4.99, upside: -0.444, financialHealthScore: 2.30, sector: "Financials" },
  { rank: 11, ticker: "TCGLF", name: "Tecnoglass Inc", market: "US", price: 41.30, fairValue: 23.01, upside: -0.443, financialHealthScore: 2.10, sector: "Industrials" },
  { rank: 12, ticker: "CRWD", name: "CrowdStrike Holdings Inc", market: "US", price: 231.00, fairValue: 128.79, upside: -0.442, financialHealthScore: 2.65, sector: "Technology" },
  { rank: 13, ticker: "OMER", name: "Omeros Corporation", market: "US", price: 18.79, fairValue: 10.54, upside: -0.439, financialHealthScore: 3.14, sector: "Healthcare" },
  { rank: 14, ticker: "AXTI", name: "AXT Inc", market: "US", price: 60.61, fairValue: 34.02, upside: -0.439, financialHealthScore: 2.05, sector: "Technology" },
  { rank: 15, ticker: "BXBL", name: "BXBL", market: "US", price: 3.89, fairValue: 2.18, upside: -0.438, financialHealthScore: 1.00, sector: "Healthcare" },
  { rank: 16, ticker: "SLS", name: "SELLAS Life Sciences Group Inc", market: "US", price: 13.34, fairValue: 7.58, upside: -0.432, financialHealthScore: 2.85, sector: "Healthcare" },
  { rank: 17, ticker: "BFLY", name: "Butterfly Network Inc", market: "US", price: 7.89, fairValue: 4.53, upside: -0.426, financialHealthScore: 2.57, sector: "Healthcare" },
  { rank: 18, ticker: "BLSM", name: "BLSM", market: "US", price: 18.30, fairValue: 10.50, upside: -0.426, financialHealthScore: 3.14, sector: "Financials" },
  { rank: 19, ticker: "PSNL", name: "Personalis Inc", market: "US", price: 16.78, fairValue: 9.64, upside: -0.425, financialHealthScore: 2.27, sector: "Healthcare" },
  { rank: 20, ticker: "HUT", name: "Hut 8 Corp.", market: "US", price: 78.64, fairValue: 45.43, upside: -0.422, financialHealthScore: 1.66, sector: "Technology" },
  { rank: 21, ticker: "ORKA", name: "Oruka Therapeutics, Inc.", market: "US", price: 92.62, fairValue: 53.58, upside: -0.421, financialHealthScore: 2.58, sector: "Healthcare" },
  { rank: 22, ticker: "QBTS", name: "D-Wave Quantum Inc.", market: "US", price: 17.19, fairValue: 9.99, upside: -0.419, financialHealthScore: 1.66, sector: "Technology" },
  { rank: 23, ticker: "HTFL", name: "Heartland Financial USA", market: "US", price: 50.39, fairValue: 29.39, upside: -0.417, financialHealthScore: 2.77, sector: "Financials" },
  { rank: 24, ticker: "KOPN", name: "Kopin Corporation", market: "US", price: 4.44, fairValue: 2.61, upside: -0.412, financialHealthScore: 2.02, sector: "Technology" },
  { rank: 25, ticker: "RHLD", name: "Resolute Holdings Management, Inc.", market: "US", price: 135.52, fairValue: 79.83, upside: -0.411, financialHealthScore: 3.04, sector: "Financials" },
  { rank: 26, ticker: "MSGS", name: "Madison Square Garden Sports Corp", market: "US", price: 384.73, fairValue: 226.79, upside: -0.410, financialHealthScore: 2.15, sector: "Communication Services" },
  { rank: 27, ticker: "TWST", name: "Twist Bioscience Corporation", market: "US", price: 139.00, fairValue: 82.07, upside: -0.410, financialHealthScore: 2.68, sector: "Healthcare" },
  { rank: 28, ticker: "PANW", name: "Palo Alto Networks Inc", market: "US", price: 382.13, fairValue: 225.99, upside: -0.409, financialHealthScore: 2.90, sector: "Technology" },
  { rank: 29, ticker: "NET", name: "Cloudflare Inc", market: "US", price: 305.11, fairValue: 181.22, upside: -0.406, financialHealthScore: 2.30, sector: "Technology" },
  { rank: 30, ticker: "ELVN", name: "Enliven Therapeutics Inc", market: "US", price: 57.89, fairValue: 34.49, upside: -0.404, financialHealthScore: 2.69, sector: "Healthcare" },
  { rank: 31, ticker: "BE", name: "Bloom Energy Corporation", market: "US", price: 206.30, fairValue: 123.07, upside: -0.403, financialHealthScore: 2.95, sector: "Industrials" },
  { rank: 32, ticker: "ZBIO", name: "Zenas BioPharma, Inc.", market: "US", price: 32.32, fairValue: 19.36, upside: -0.401, financialHealthScore: 1.59, sector: "Healthcare" },
  { rank: 33, ticker: "PLBL", name: "PLBL", market: "US", price: 5.66, fairValue: 3.40, upside: -0.399, financialHealthScore: 2.09, sector: "Consumer Discretionary" },
  { rank: 34, ticker: "RGTI", name: "Rigetti Computing Inc", market: "US", price: 15.66, fairValue: 9.43, upside: -0.398, financialHealthScore: 1.73, sector: "Technology" },
  { rank: 35, ticker: "TRVI", name: "Trevi Therapeutics Inc", market: "US", price: 16.60, fairValue: 10.04, upside: -0.395, financialHealthScore: 2.60, sector: "Healthcare" },
  { rank: 36, ticker: "INBX", name: "Inhibrx Biosciences, Inc.", market: "US", price: 126.70, fairValue: 77.00, upside: -0.392, financialHealthScore: 2.41, sector: "Healthcare" },
  { rank: 37, ticker: "SRRK", name: "Scholar Rock Holding Corporation", market: "US", price: 56.80, fairValue: 34.64, upside: -0.390, financialHealthScore: 1.88, sector: "Healthcare" },
  { rank: 38, ticker: "METC", name: "Ramaco Resources Inc", market: "US", price: 14.24, fairValue: 8.68, upside: -0.390, financialHealthScore: 1.79, sector: "Basic Materials" },
  { rank: 39, ticker: "GKOS", name: "Glaukos Corporation", market: "US", price: 179.56, fairValue: 109.57, upside: -0.390, financialHealthScore: 2.74, sector: "Healthcare" },
  { rank: 40, ticker: "ROMA", name: "Roma Green Finance Limited", market: "US", price: 8.89, fairValue: 5.43, upside: -0.389, financialHealthScore: 1.73, sector: "Financials" },
];

export const EXPERT_CONSENSUS_US_BEARISH_TICKER_ORDER = EXPERT_CONSENSUS_US_BEARISH_BENCHMARKS.map((row) => row.ticker);

export const EXPERT_CONSENSUS_US_ALL_BENCHMARKS = [
  ...EXPERT_CONSENSUS_US_BENCHMARKS,
  ...EXPERT_CONSENSUS_US_BEARISH_BENCHMARKS,
];

export const EXPERT_CONSENSUS_US_TICKER_ORDER = EXPERT_CONSENSUS_US_BENCHMARKS.map((row) => row.ticker);
export const EXPERT_CONSENSUS_US_TICKERS = new Set([
  ...EXPERT_CONSENSUS_US_TICKER_ORDER,
  ...EXPERT_CONSENSUS_US_BEARISH_TICKER_ORDER,
]);

const US_BENCHMARK_BY_TICKER = new Map(EXPERT_CONSENSUS_US_ALL_BENCHMARKS.map((row) => [row.ticker, row]));

export function expertConsensusUsBenchmarkForTicker(ticker: unknown, market: unknown) {
  if (String(market).trim().toUpperCase() !== "US") return undefined;
  return US_BENCHMARK_BY_TICKER.get(String(ticker).trim().toUpperCase());
}
