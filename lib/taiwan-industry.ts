export type TaiwanListingBoard = "TWSE" | "TPEx";

type TaiwanIndustryMap = Readonly<Record<string, string>>;

// These are the current exchange industry codes used by the public company
// basic-data feeds. They are display metadata only; valuation still uses the
// original sector label and inputs.
const TWSE_INDUSTRY_LABELS: TaiwanIndustryMap = {
  "01": "水泥工業",
  "02": "食品工業",
  "03": "塑膠工業",
  "04": "紡織纖維",
  "05": "電機機械",
  "06": "電器電纜",
  "08": "玻璃陶瓷",
  "09": "造紙工業",
  "10": "鋼鐵工業",
  "11": "橡膠工業",
  "12": "汽車工業",
  "14": "建材營造",
  "15": "航運業",
  "16": "觀光餐旅",
  "17": "金融保險業",
  "18": "貿易百貨",
  "20": "其他",
  "21": "化學工業",
  "22": "生技醫療業",
  "23": "油電燃氣業",
  "24": "半導體業",
  "25": "電腦及週邊設備業",
  "26": "光電業",
  "27": "通信網路業",
  "28": "電子零組件業",
  "29": "電子通路業",
  "30": "資訊服務業",
  "31": "其他電子業",
  "35": "綠能環保",
  "36": "數位雲端",
  "37": "運動休閒",
  "38": "居家生活",
  "91": "其他",
};

const TPEX_INDUSTRY_LABELS: TaiwanIndustryMap = {
  "02": "食品工業",
  "03": "塑膠工業",
  "04": "紡織纖維",
  "05": "電機機械",
  "06": "電器電纜",
  "10": "鋼鐵工業",
  "14": "建材營造",
  "15": "航運業",
  "16": "觀光餐旅",
  "17": "金融業",
  "20": "其他",
  "21": "化學工業",
  "22": "生技醫療業",
  "23": "油電燃氣業",
  "24": "半導體業",
  "25": "電腦及週邊設備業",
  "26": "光電業",
  "27": "通信網路業",
  "28": "電子零組件業",
  "29": "電子通路業",
  "30": "資訊服務業",
  "31": "其他電子業",
  "32": "文化創意業",
  "33": "農業科技",
  "35": "綠能環保",
  "36": "數位雲端",
  "37": "運動休閒",
  "38": "居家生活",
};

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function field(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = text(row[name]);
    if (value) return value;
  }
  return undefined;
}

export function buildTaiwanIndustryMap(
  rows: readonly Record<string, unknown>[],
  board: TaiwanListingBoard,
) {
  const labels = board === "TWSE" ? TWSE_INDUSTRY_LABELS : TPEX_INDUSTRY_LABELS;
  const result = new Map<string, string>();
  for (const row of rows) {
    const ticker = field(row, board === "TWSE" ? ["公司代號", "Code"] : ["SecuritiesCompanyCode"]);
    const code = field(row, board === "TWSE" ? ["產業別", "SecuritiesIndustryCode"] : ["SecuritiesIndustryCode"]);
    if (ticker && code && labels[code]) result.set(ticker, labels[code]);
  }
  return result;
}

export function industryFromCode(code: unknown, board: TaiwanListingBoard) {
  const normalized = text(code);
  if (!normalized) return undefined;
  return (board === "TWSE" ? TWSE_INDUSTRY_LABELS : TPEX_INDUSTRY_LABELS)[normalized];
}
