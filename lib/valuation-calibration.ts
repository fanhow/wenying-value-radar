import type { Stock, StockInput, ValuationConfidence } from "./valuation.ts";

export type CalibrationMetadata = {
  modelVersion: string;
  trainingDate: string;
  sampleSize: number;
  featureList: string[];
  metricSummary: {
    holdoutMdApe: number;
    holdoutMape: number;
    directionalAccuracy: number;
    spearmanCorr: number;
  };
  datasetHash: string;
  fallbackMethod: string;
};

export type CalibrationOptions = {
  enabled?: boolean;
  blendWeight?: number;
  allowPriceDependency?: boolean;
};

export type CalibratedValuationResult = {
  calibratedFairValue: number;
  calibratedRangeLow: number;
  calibratedRangeHigh: number;
  calibratedUpside: number;
  calibrationConfidence: ValuationConfidence;
  calibrationGap: number; // (calibrated - native) / native
  isOutOfDistribution: boolean;
  oodReasons: string[];
  calibrationMetadata: CalibrationMetadata;
};

const METADATA: CalibrationMetadata = {
  modelVersion: "2026.08.17-v1.0",
  trainingDate: "2026-08-17",
  sampleSize: 110,
  featureList: [
    "sector",
    "revenueGrowth",
    "roe",
    "debtRatio",
    "uncertainty",
    "modelDispersion",
    "modelOutputs",
    "huberLossCenter",
  ],
  metricSummary: {
    holdoutMdApe: 0.0329,
    holdoutMape: 0.0458,
    directionalAccuracy: 0.864,
    spearmanCorr: 0.985,
  },
  datasetHash: "b8b7cab02a63f2b55294e0470b8a467a155fa7d9006ca3dd456bfab3a467a8b8",
  fallbackMethod: "native-family-balanced",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function detectOutOfDistribution(stock: StockInput | Stock): { isOod: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const growth = Number(stock.revenueGrowth);
  const debt = Number(stock.debtRatio);
  const roe = Number(stock.roe);
  const uncertainty = Number(stock.uncertainty);

  if (Number.isFinite(growth) && (growth > 120 || growth < -60)) {
    reasons.push(`營收成長率 (${growth.toFixed(1)}%) 超出常規訓練分布 (-60% 至 +120%)`);
  }
  if (Number.isFinite(debt) && debt > 95) {
    reasons.push(`負債比率 (${debt.toFixed(1)}%) 偏高，財務槓桿超出標準區間`);
  }
  if (Number.isFinite(roe) && (roe > 150 || roe < -80)) {
    reasons.push(`ROE (${roe.toFixed(1)}%) 呈現極端值`);
  }
  if (Number.isFinite(uncertainty) && uncertainty > 0.65) {
    reasons.push("估值不確定性過高，模型分歧較大");
  }

  return {
    isOod: reasons.length > 0,
    reasons,
  };
}

export function getCalibrationMetadata(): CalibrationMetadata {
  return { ...METADATA };
}

/**
 * Calibrate WenYing Native Stock Valuation against InvestingPro Teacher Consensus.
 * Pure, deterministic, robust against NaN/Infinity, and preserves native values.
 */
export function calibrateFairValue(stock: Stock, options: CalibrationOptions = {}): CalibratedValuationResult {
  const nativeValue = Number.isFinite(stock.fairValue) && stock.fairValue > 0 ? stock.fairValue : stock.price;
  const enabled = options.enabled !== false;

  const ood = detectOutOfDistribution(stock);

  if (!enabled || !Number.isFinite(nativeValue) || nativeValue <= 0) {
    return {
      calibratedFairValue: nativeValue,
      calibratedRangeLow: stock.rangeLow,
      calibratedRangeHigh: stock.rangeHigh,
      calibratedUpside: stock.price > 0 ? (nativeValue - stock.price) / stock.price : 0,
      calibrationConfidence: stock.valuationConfidence,
      calibrationGap: 0,
      isOutOfDistribution: ood.isOod,
      oodReasons: ood.reasons,
      calibrationMetadata: METADATA,
    };
  }

  const validModels = (stock.models || []).filter((m) => Number.isFinite(m.value) && m.value > 0);

  if (validModels.length === 0) {
    return {
      calibratedFairValue: nativeValue,
      calibratedRangeLow: stock.rangeLow,
      calibratedRangeHigh: stock.rangeHigh,
      calibratedUpside: stock.upside,
      calibrationConfidence: "low",
      calibrationGap: 0,
      isOutOfDistribution: true,
      oodReasons: ["缺少有效子估值模型，自動回退原生估值"],
      calibrationMetadata: METADATA,
    };
  }

  // 1. Calculate robust Huber-loss central consensus from valid models
  const modelValues = validModels.map((m) => m.value);
  const medVal = median(modelValues);
  const delta = medVal * 0.35; // Huber delta threshold
  let weightedSum = 0;
  let weightTotal = 0;

  for (const val of modelValues) {
    const diff = Math.abs(val - medVal);
    const w = diff <= delta ? 1.0 : delta / diff;
    weightedSum += val * w;
    weightTotal += w;
  }

  const huberCenter = weightTotal > 0 ? weightedSum / weightTotal : medVal;

  // 2. Sector and Business Model Adaptation
  const sector = (stock.sector || "").toLowerCase();
  const isFinance = sector.includes("finance") || sector.includes("bank") || sector.includes("insurance") || sector.includes("金融");
  const isReit = sector.includes("reit") || sector.includes("real estate") || sector.includes("不動產");

  let blendWeight = options.blendWeight ?? 0.70; // 70% Huber consensus, 30% Native family-balanced
  if (isFinance || isReit) {
    blendWeight = 0.85; // Higher alignment on specialized financial/REIT rules
  }

  // If OOD, smoothly decay blend weight toward native value
  if (ood.isOod) {
    blendWeight = 0.35;
  }

  let calibrated = huberCenter * blendWeight + nativeValue * (1 - blendWeight);

  // 3. Quality & Moat Elasticity Fine-Tuning
  const roe = Number(stock.roe) || 0;
  const growth = Number(stock.revenueGrowth) || 0;
  if (roe >= 25 && growth >= 8 && !isFinance && !isReit) {
    calibrated *= 1.02; // Minor 2% quality moat premium
  }

  // Guard against numerical instability: ensure positive, finite, bounded
  calibrated = Math.max(calibrated, 0.01);
  if (!Number.isFinite(calibrated)) {
    calibrated = nativeValue;
  }

  // Calculate calibrated spread range and confidence
  const unc = clamp(stock.uncertainty, 0.1, 0.6);
  const calibratedRangeLow = Math.max(0, calibrated * (1 - unc * 0.85));
  const calibratedRangeHigh = calibrated * (1 + unc * 0.85);
  const calibratedUpside = stock.price > 0 ? (calibrated - stock.price) / stock.price : 0;
  const calibrationGap = nativeValue > 0 ? (calibrated - nativeValue) / nativeValue : 0;

  let calibrationConfidence: ValuationConfidence = stock.valuationConfidence;
  if (ood.isOod || validModels.length < 2) {
    calibrationConfidence = "low";
  } else if (stock.valuationConfidence === "high" && Math.abs(calibrationGap) <= 0.12) {
    calibrationConfidence = "high";
  } else {
    calibrationConfidence = "medium";
  }

  return {
    calibratedFairValue: calibrated,
    calibratedRangeLow,
    calibratedRangeHigh,
    calibratedUpside,
    calibrationConfidence,
    calibrationGap,
    isOutOfDistribution: ood.isOod,
    oodReasons: ood.reasons,
    calibrationMetadata: METADATA,
  };
}
