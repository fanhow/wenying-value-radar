export type StockDirectoryEntry = {
  ticker: string;
  market: "TW" | "US";
  nameZh: string;
  nameEn: string;
  aliases: string[];
};

export type MarketSymbol = {
  ticker: string;
  market: "TW" | "US";
  name: string;
};

export type YahooTaiwanSnapshot = {
  name: string;
  price: number;
  eps: number;
  bvps: number;
  updatedAt: string;
};

const stockDirectory: StockDirectoryEntry[] = [
  {
    ticker: "2330",
    market: "TW",
    nameZh: "台積電",
    nameEn: "TSMC",
    aliases: ["台灣積體電路", "taiwan semiconductor", "tsmc"],
  },
  {
    ticker: "2454",
    market: "TW",
    nameZh: "聯發科",
    nameEn: "MediaTek",
    aliases: ["聯發科技", "mediatek", "media tek"],
  },
  {
    ticker: "AAPL",
    market: "US",
    nameZh: "Apple",
    nameEn: "Apple",
    aliases: ["apple inc", "蘋果"],
  },
];

export function isTaiwanSymbolQuery(query: string) {
  const normalized = query.trim();
  return /^\d/.test(normalized) || /[\u3400-\u9fff]/.test(normalized);
}

export function findStockDirectoryEntries(query: string, limit = 4) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return stockDirectory
    .filter((entry) => [entry.ticker, entry.nameZh, entry.nameEn, ...entry.aliases]
      .some((value) => value.toLowerCase().includes(normalized)))
    .slice(0, limit);
}

export function rankMarketSymbols(entries: MarketSymbol[], query: string, limit = 6) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return entries
    .filter((entry, index, all) => entry.ticker && entry.name
      && all.findIndex((candidate) => candidate.ticker === entry.ticker) === index
      && (entry.ticker.toLowerCase().includes(normalized) || entry.name.toLowerCase().includes(normalized)))
    .sort((left, right) => {
      const leftTicker = left.ticker.toLowerCase();
      const rightTicker = right.ticker.toLowerCase();
      const leftScore = leftTicker === normalized ? 0 : leftTicker.startsWith(normalized) ? 1 : 2;
      const rightScore = rightTicker === normalized ? 0 : rightTicker.startsWith(normalized) ? 1 : 2;
      return leftScore - rightScore || leftTicker.localeCompare(rightTicker);
    })
    .slice(0, limit);
}

export function parseYahooTaiwanHtml(html: string): YahooTaiwanSnapshot | null {
  const name = html.match(/"symbolName":"([^"]+)"/)?.[1] ?? "";
  const price = Number(html.match(/"regularMarketPrice":([\d.]+)/)?.[1] ?? 0);
  const incomeJson = html.match(/"incomesQ":(\[[^\]]*\])/)?.[1];
  if (!name || !price || !incomeJson) return null;

  try {
    const incomes = JSON.parse(incomeJson) as Array<{ date?: string; eps?: string; bps?: string }>;
    const latest = incomes[0];
    const eps = incomes.slice(0, 4).reduce((sum, row) => sum + Number(row.eps || 0), 0);
    return {
      name,
      price,
      eps: Number.isFinite(eps) ? eps : 0,
      bvps: Number(latest?.bps || 0),
      updatedAt: latest?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    };
  } catch {
    return null;
  }
}

export function safeLookupError(message: string, language: "zh" | "en") {
  if (!message || /https?:\/\/|redirect|fetch failed|network|socket|資料來源回應/i.test(message)) {
    return language === "zh"
      ? "公開資料暫時無法連線，請稍後再試。"
      : "Public market data is temporarily unavailable. Please try again later.";
  }
  return message;
}
