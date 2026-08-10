export type Market = "TW" | "US";
export type RiskLevel = "低" | "中" | "高";

export type StockInput = {
  ticker: string;
  name: string;
  market: Market;
  sector: string;
  price: number;
  eps: number;
  bvps: number;
  fcfPerShare: number;
  targetPe: number;
  targetPb: number;
  targetFcfMultiple: number;
  revenueGrowth: number;
  roe: number;
  debtRatio: number;
  uncertainty: number;
  assetType?: "EQUITY" | "ETF";
  updatedAt?: string;
  source?: "示範資料" | "手動輸入" | "自動資料" | "方舟截圖";
  sourceNote?: string;
  qualityAvailable?: boolean;
  riskOverride?: RiskLevel;
};

export type Stock = StockInput & {
  models: { label: string; value: number; weight: number; explanation: string }[];
  fairValue: number;
  rangeLow: number;
  rangeHigh: number;
  upside: number;
  qualityScore: number;
  risk: RiskLevel;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function valuationTargets(revenueGrowth: number, roe: number, debtRatio: number) {
  const growth = clamp(revenueGrowth, -50, 80);
  const profitability = clamp(roe, -50, 100);
  const leveragePenalty = Math.max(debtRatio - 60, 0) * 0.08;
  return {
    targetPe: clamp(12 + Math.max(growth, 0) * 0.25 + Math.max(profitability - 10, 0) * 0.12 - leveragePenalty, 8, 28),
    targetPb: clamp(0.8 + Math.max(profitability, 0) * 0.06, 0.8, 4),
    targetFcfMultiple: clamp(12 + Math.max(growth, 0) * 0.2 - leveragePenalty, 10, 26),
  };
}

export function calculateStock(input: StockInput, formatNumber = (value: number) => String(value)): Stock {
  if (input.assetType === "ETF") {
    const fairValue = input.eps;
    return {
      ...input,
      models: [{ label: "即時淨值法", value: fairValue, weight: 1, explanation: "採用方舟截圖中的即時淨值（iNAV）" }],
      fairValue,
      rangeLow: fairValue * (1 - input.uncertainty),
      rangeHigh: fairValue * (1 + input.uncertainty),
      upside: input.price > 0 ? (fairValue - input.price) / input.price : 0,
      qualityScore: 0,
      risk: input.riskOverride ?? "中",
    };
  }

  const rawModels = [
    {
      label: "本益比法",
      value: Math.max(input.eps * input.targetPe, 0),
      weight: 0.45,
      explanation: `EPS ${formatNumber(input.eps)} × 目標本益比 ${formatNumber(input.targetPe)}`,
    },
    {
      label: "股價淨值比法",
      value: Math.max(input.bvps * input.targetPb, 0),
      weight: 0.25,
      explanation: `每股淨值 ${formatNumber(input.bvps)} × 目標 PB ${formatNumber(input.targetPb)}`,
    },
    {
      label: "自由現金流法",
      value: Math.max(input.fcfPerShare * input.targetFcfMultiple, 0),
      weight: 0.3,
      explanation: `每股 FCF ${formatNumber(input.fcfPerShare)} × 現金流倍數 ${formatNumber(input.targetFcfMultiple)}`,
    },
  ].filter((model) => model.value > 0 && model.weight > 0);
  const rawWeight = rawModels.reduce((sum, model) => sum + model.weight, 0) || 1;
  const models = rawModels.map((model) => ({ ...model, weight: model.weight / rawWeight }));
  const fairValue = models.reduce((sum, model) => sum + model.value * model.weight, 0);
  const rangeLow = fairValue * (1 - input.uncertainty);
  const rangeHigh = fairValue * (1 + input.uncertainty);
  const upside = input.price > 0 ? (fairValue - input.price) / input.price : 0;
  const qualityScore = input.qualityAvailable === false ? 0 : Math.round(
    clamp(50 + input.roe * 0.34 + input.revenueGrowth * 0.6 - input.debtRatio * 0.2, 0, 100),
  );
  const risk = input.riskOverride
    ?? (input.uncertainty >= 0.28 || input.debtRatio >= 75 ? "高" : input.uncertainty >= 0.2 ? "中" : "低");

  return { ...input, models, fairValue, rangeLow, rangeHigh, upside, qualityScore, risk };
}
