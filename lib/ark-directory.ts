import type { SecTickerRow } from "./ark-parser.ts";
import tpexSnapshot from "./tpex-snapshot.json" with { type: "json" };
import usMarketSnapshot from "./us-market-snapshot.json" with { type: "json" };

export type ArkUsSnapshotRow = {
  ticker: string;
  name: string;
  price: number;
  eps: number;
  bvps: number;
  dividendPerShare: number;
  sector: string;
  date: string;
};

const taiwanEtfDirectory = [
  { ticker: "00876", name: "元大全球5G", price: 89.25 },
  { ticker: "00830", name: "國泰費城半導體", price: 88.45 },
  { ticker: "00631L", name: "元大台灣50正2", price: 34.7 },
  { ticker: "00875", name: "國泰網路資安", price: 56.15 },
  { ticker: "0052", name: "富邦科技", price: 60.95 },
  { ticker: "0050", name: "元大台灣50", price: 104.25 },
  { ticker: "0053", name: "元大電子", price: 237 },
  { ticker: "0057", name: "富邦摩台", price: 311.15 },
] as const;

const arkUsDirectory: SecTickerRow[] = [
  { cik_str: 2488, ticker: "AMD", title: "Advanced Micro Devices Inc." },
  { cik_str: 723125, ticker: "MU", title: "Micron Technology Inc." },
  { cik_str: 6951, ticker: "AMAT", title: "Applied Materials Inc." },
  { cik_str: 50863, ticker: "INTC", title: "Intel Corporation" },
  { cik_str: 858877, ticker: "CSCO", title: "Cisco Systems Inc." },
  { cik_str: 1046179, ticker: "TSM", title: "Taiwan Semiconductor Manufacturing Co. Ltd." },
  { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA Corporation" },
  { cik_str: 1327567, ticker: "PANW", title: "Palo Alto Networks Inc." },
];

const manualUsSnapshots: ArkUsSnapshotRow[] = [
  {
    ticker: "TSM",
    name: "Taiwan Semiconductor Manufacturing Co. Ltd.",
    price: 418.47,
    eps: 6.8,
    bvps: 24.96,
    dividendPerShare: 0,
    sector: "Technology",
    date: "2024-12-31",
  },
];

export function fallbackTaiwanSymbols() {
  return new Map<string, { name: string; price: number }>([
    ...tpexSnapshot.map((row) => [row.ticker, { name: row.name, price: Number(row.close) || 0 }] as const),
    ...taiwanEtfDirectory.map((row) => [row.ticker, { name: row.name, price: row.price }] as const),
  ]);
}

export function fallbackUsSymbols() {
  const rows = new Map<string, SecTickerRow>(
    usMarketSnapshot.map((row) => [row.ticker.toUpperCase(), {
      cik_str: 0,
      ticker: row.ticker.toUpperCase(),
      title: row.name,
      price: Number(row.price) || 0,
    }]),
  );
  for (const row of manualUsSnapshots) {
    rows.set(row.ticker, { cik_str: 0, ticker: row.ticker, title: row.name, price: row.price });
  }
  for (const row of arkUsDirectory) rows.set(row.ticker, { ...row, price: rows.get(row.ticker)?.price });
  return rows;
}

export function findArkUsDirectoryRow(ticker: string) {
  return fallbackUsSymbols().get(ticker.toUpperCase());
}

export function findArkUsSnapshot(ticker: string): ArkUsSnapshotRow | undefined {
  const normalized = ticker.toUpperCase();
  const row = usMarketSnapshot.find((item) => item.ticker.toUpperCase() === normalized);
  if (row) return row as ArkUsSnapshotRow;
  return manualUsSnapshots.find((item) => item.ticker === normalized);
}
