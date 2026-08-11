export type Market = "TW" | "US";
export type RiskLevel = "低" | "中" | "高";
export type DataCompleteness = "complete" | "historical" | "limited";
export type ValuationConfidence = "high" | "medium" | "low";

export type StockInput = {
  ticker: string;
  name: string;
  market: Market;
  sector: string;
  price: number;
  eps: number;
  bvps: number;
  fcfPerShare: number;
  dividendPerShare?: number;
  targetPe: number;
  targetPb: number;
  targetFcfMultiple: number;
  discountRate?: number;
  terminalGrowth?: number;
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
  dataCompleteness?: DataCompleteness;
  forwardDataAvailable?: boolean;
};

export type Stock = StockInput & {
  models: { label: string; value: number; weight: number; explanation: string }[];
  fairValue: number;
  rangeLow: number;
  rangeHigh: number;
  upside: number;
  qualityScore: number;
  risk: RiskLevel;
  valuationConfidence: ValuationConfidence;
  requiresForwardData: boolean;
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

export function discountedCashFlowPerShare(
  fcfPerShare: number,
  growthRate: number,
  discountRate: number,
  terminalGrowth: number,
  years = 5,
) {
  if (fcfPerShare <= 0 || discountRate <= terminalGrowth) return 0;
  const growth = clamp(growthRate, -0.05, 0.15);
  const discount = clamp(discountRate, 0.07, 0.18);
  const terminal = clamp(terminalGrowth, 0, Math.max(discount - 0.03, 0));
  let cashFlow = fcfPerShare;
  let presentValue = 0;
  for (let year = 1; year <= years; year += 1) {
    cashFlow *= 1 + growth;
    presentValue += cashFlow / ((1 + discount) ** year);
  }
  const terminalValue = (cashFlow * (1 + terminal)) / (discount - terminal);
  return presentValue + terminalValue / ((1 + discount) ** years);
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
      valuationConfidence: "medium",
      requiresForwardData: false,
    };
  }

  const descriptor = `${input.name} ${input.sector}`;
  const isFinancial = /bank|finance|financial|insurance|reinsurance|mortgage|reit|銀行|金控|保險|證券|金融/i.test(descriptor);
  const isAssetLight = !isFinancial && input.roe >= 25;
  const discountRate = clamp(
    input.discountRate
      ?? (0.085 + Math.max(input.debtRatio - 50, 0) * 0.0005 + Math.max(input.uncertainty - 0.2, 0) * 0.08),
    0.075,
    0.16,
  );
  const forecastGrowth = clamp((input.revenueGrowth / 100) * 0.5, -0.03, 0.12);
  const terminalGrowth = clamp(
    input.terminalGrowth ?? (0.02 + clamp(input.revenueGrowth, 0, 20) * 0.0005),
    0.01,
    Math.min(0.035, discountRate - 0.035),
  );
  const dcfValue = isFinancial
    ? 0
    : discountedCashFlowPerShare(input.fcfPerShare, forecastGrowth, discountRate, terminalGrowth);
  const earningsPowerValue = input.eps > 0 ? input.eps / discountRate : 0;
  const grahamValue = input.eps > 0 && input.bvps > 0 ? Math.sqrt(22.5 * input.eps * input.bvps) : 0;
  const dividendGrowth = Math.min(Math.max(terminalGrowth, 0), discountRate - 0.03);
  const dividendValue = (input.dividendPerShare ?? 0) > 0 && discountRate > dividendGrowth
    ? ((input.dividendPerShare ?? 0) * (1 + dividendGrowth)) / (discountRate - dividendGrowth)
    : 0;

  const rawModels = [
    {
      label: "本益比法",
      value: Math.max(input.eps * input.targetPe, 0),
      weight: isFinancial ? 0.25 : isAssetLight ? 0.3 : 0.2,
      explanation: `EPS ${formatNumber(input.eps)} × 目標本益比 ${formatNumber(input.targetPe)}`,
    },
    {
      label: "股價淨值比法",
      value: Math.max(input.bvps * input.targetPb, 0),
      weight: isFinancial ? 0.35 : isAssetLight ? 0 : 0.1,
      explanation: `每股淨值 ${formatNumber(input.bvps)} × 目標 PB ${formatNumber(input.targetPb)}`,
    },
    {
      label: "自由現金流倍數法",
      value: Math.max(input.fcfPerShare * input.targetFcfMultiple, 0),
      weight: isFinancial ? 0 : isAssetLight ? 0.18 : 0.15,
      explanation: `每股 FCF ${formatNumber(input.fcfPerShare)} × 現金流倍數 ${formatNumber(input.targetFcfMultiple)}`,
    },
    {
      label: "折現現金流法",
      value: Math.max(dcfValue, 0),
      weight: isFinancial ? 0 : isAssetLight ? 0.34 : 0.3,
      explanation: `5 年 FCF 折現；折現率 ${formatNumber(discountRate * 100)}%，永續成長 ${formatNumber(terminalGrowth * 100)}%`,
    },
    {
      label: "盈餘能力價值法",
      value: Math.max(earningsPowerValue, 0),
      weight: isFinancial ? 0.2 : isAssetLight ? 0.08 : 0.15,
      explanation: `正常化 EPS ${formatNumber(input.eps)} ÷ 要求報酬率 ${formatNumber(discountRate * 100)}%`,
    },
    {
      label: "Graham 防禦估值",
      value: Math.max(grahamValue, 0),
      weight: isAssetLight ? 0 : 0.1,
      explanation: `√(22.5 × EPS ${formatNumber(input.eps)} × 每股淨值 ${formatNumber(input.bvps)})`,
    },
    {
      label: "股利折現法",
      value: Math.max(dividendValue, 0),
      weight: isFinancial ? 0.15 : 0.1,
      explanation: `股利 ${formatNumber(input.dividendPerShare ?? 0)}；要求報酬率 ${formatNumber(discountRate * 100)}%`,
    },
  ].filter((model) => model.value > 0 && model.weight > 0);

  const marketFiltered = input.price > 0
    ? rawModels.filter((model) => model.value >= input.price * 0.4 && model.value <= input.price * 2)
    : rawModels;
  const reliableModels = marketFiltered.length >= 2 ? marketFiltered : rawModels;
  const rawWeight = reliableModels.reduce((sum, model) => sum + model.weight, 0) || 1;
  const models = reliableModels.map((model) => ({ ...model, weight: model.weight / rawWeight }));
  const fairValue = models.reduce((sum, model) => sum + model.value * model.weight, 0);
  const dispersion = fairValue > 0
    ? models.reduce((sum, model) => sum + model.weight * Math.abs(model.value - fairValue) / fairValue, 0)
    : 0.6;
  const modelCountFloor = models.length >= 5 ? 0.15 : models.length >= 3 ? 0.22 : models.length >= 2 ? 0.3 : 0.42;
  const uncertainty = clamp(Math.max(input.uncertainty * 0.75, modelCountFloor, dispersion * 1.25), 0.12, 0.6);
  const rangeLow = fairValue * (1 - uncertainty);
  const rangeHigh = fairValue * (1 + uncertainty);
  const upside = input.price > 0 ? (fairValue - input.price) / input.price : 0;
  const qualityScore = input.qualityAvailable === false ? 0 : Math.round(
    clamp(50 + input.roe * 0.34 + input.revenueGrowth * 0.6 - input.debtRatio * 0.2, 0, 100),
  );
  const risk = input.riskOverride
    ?? (uncertainty >= 0.32 || input.debtRatio >= 75 ? "高" : uncertainty >= 0.2 ? "中" : "低");
  const trailingPe = input.eps > 0 ? input.price / input.eps : Number.POSITIVE_INFINITY;
  const requiresForwardData = input.forwardDataAvailable !== true
    && (trailingPe > 35 || input.revenueGrowth >= 20 || input.fcfPerShare <= 0);
  const dataCompleteness = input.dataCompleteness
    ?? (input.qualityAvailable === false ? "limited" : "complete");
  const valuationConfidence: ValuationConfidence = dataCompleteness === "limited"
    || models.length < 2
    || requiresForwardData
    ? "low"
    : dataCompleteness === "complete" && input.forwardDataAvailable === true && models.length >= 4 && uncertainty <= 0.24
      ? "high"
      : "medium";

  return {
    ...input,
    discountRate,
    terminalGrowth,
    uncertainty,
    models,
    fairValue,
    rangeLow,
    rangeHigh,
    upside,
    qualityScore,
    risk,
    valuationConfidence,
    requiresForwardData,
  };
}
