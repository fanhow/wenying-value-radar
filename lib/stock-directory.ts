export type StockDirectoryEntry = {
  ticker: string;
  market: "TW" | "US";
  nameZh: string;
  nameEn: string;
  aliases: string[];
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
    ticker: "AAPL",
    market: "US",
    nameZh: "Apple",
    nameEn: "Apple",
    aliases: ["apple inc", "蘋果"],
  },
];

export function findStockDirectoryEntries(query: string, limit = 4) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return stockDirectory
    .filter((entry) => [entry.ticker, entry.nameZh, entry.nameEn, ...entry.aliases]
      .some((value) => value.toLowerCase().includes(normalized)))
    .slice(0, limit);
}

export function safeLookupError(message: string, language: "zh" | "en") {
  if (!message || /https?:\/\/|redirect|fetch failed|network|socket|資料來源回應/i.test(message)) {
    return language === "zh"
      ? "公開資料暫時無法連線，請稍後再試。"
      : "Public market data is temporarily unavailable. Please try again later.";
  }
  return message;
}
