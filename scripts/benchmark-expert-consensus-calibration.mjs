import fs from "node:fs/promises";
import path from "node:path";
import { calculateStock } from "../lib/valuation.ts";
import { importExpertConsensusTrainingData } from "./import-expert-consensus-training-data.mjs";
import { selectLegacyBenchmarkTarget, summarizeLegacyTargets, formatLegacyMetric, renderLegacyBenchmarkReport } from "./legacy-benchmark-report.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const benchmarkOutputPath = path.join(repoRoot, "outputs/legacy-valuation-benchmark-diagnostic.md");

// Helper functions for statistics
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function trimmedMean(values, trimFraction = 0.1) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trimFraction);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  return trimmed.length > 0 ? mean(trimmed) : median(values);
}

function winsorizedMean(values, trimFraction = 0.1) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trimFraction);
  const lowVal = sorted[trimCount];
  const highVal = sorted[sorted.length - 1 - trimCount];
  const winsorized = sorted.map((v) => Math.min(Math.max(v, lowVal), highVal));
  return mean(winsorized);
}

function spearmanRankCorr(x, y) {
  if (x.length !== y.length || x.length < 2) return 0;
  const rank = (arr) => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    for (let i = 0; i < sorted.length; i++) {
      ranks[sorted[i].i] = i + 1;
    }
    return ranks;
  };
  const rx = rank(x);
  const ry = rank(y);
  const n = x.length;
  let d2Sum = 0;
  for (let i = 0; i < n; i++) {
    const diff = rx[i] - ry[i];
    d2Sum += diff * diff;
  }
  return 1 - (6 * d2Sum) / (n * (n * n - 1));
}

// Compute performance metrics
function evaluatePredictions(records) {
  const valid = records.filter(
    (r) => Number.isFinite(r.pred) && Number.isFinite(r.target) && r.pred > 0 && r.target > 0,
  );
  if (valid.length === 0) {
    return {
      count: 0,
      mdape: null,
      mape: null,
      medianSignedError: null,
      meanSignedError: null,
      directionAccuracy: null,
      spearmanCorr: null,
      within5Pct: null,
      within10Pct: null,
      within15Pct: null,
    };
  }

  const percentageErrors = valid.map((r) => Math.abs(r.pred - r.target) / r.target);
  const signedErrors = valid.map((r) => (r.pred - r.target) / r.target);
  const predUpsides = valid.map((r) => (r.price > 0 ? (r.pred - r.price) / r.price : 0));
  const targetUpsides = valid.map((r) => (r.price > 0 ? (r.target - r.price) / r.price : 0));

  const directionMatches = valid.filter((r) => {
    const predUp = r.pred >= r.price;
    const targetUp = r.target >= r.price;
    return predUp === targetUp;
  });

  const within5 = percentageErrors.filter((e) => e <= 0.05).length / valid.length;
  const within10 = percentageErrors.filter((e) => e <= 0.1).length / valid.length;
  const within15 = percentageErrors.filter((e) => e <= 0.15).length / valid.length;

  return {
    count: valid.length,
    mdape: median(percentageErrors),
    mape: mean(percentageErrors),
    medianSignedError: median(signedErrors),
    meanSignedError: mean(signedErrors),
    directionAccuracy: directionMatches.length / valid.length,
    spearmanCorr: spearmanRankCorr(predUpsides, targetUpsides),
    within5Pct: within5,
    within10Pct: within10,
    within15Pct: within15,
  };
}

// Generate cross-validation / benchmark splits and run all methods
export async function runValuationBenchmark() {
  console.warn("LEGACY_DIAGNOSTIC_ONLY: mixed unverified workbook/self-model targets; defaults in inputs; no fitted training, independent external holdout, or production accuracy claim.");
  console.log("===============================================================");
  console.log("   WENYING VALUE RADAR × EXPERT CONSENSUS VALUATION BENCHMARK LAB   ");
  console.log("===============================================================");

  const { dataset, fileHash, datasetHash } = await importExpertConsensusTrainingData();
  const universe = dataset.universe;
  const usSnapshot = JSON.parse(await fs.readFile(path.join(repoRoot, "lib/us-market-snapshot.json"), "utf8"));

  // Legacy mixed sample: workbook numbers and self-model proxies are not an
  // independently verified external benchmark; financial inputs include defaults.
  const sampleItems = [];

  for (const item of universe) {
    const stock = calculateStock({
      ticker: item.ticker,
      name: item.name,
      market: item.market,
      sector: item.sector,
      price: item.price ?? 100,
      eps: item.financials.eps ?? 5,
      bvps: item.financials.bvps ?? 30,
      fcfPerShare: item.financials.fcfPerShare ?? 4,
      targetPe: 18,
      targetPb: 2.5,
      targetFcfMultiple: 20,
      revenueGrowth: item.financials.revenueGrowth ?? 10,
      roe: item.financials.roe ?? 15,
      debtRatio: item.financials.debtRatio ?? 40,
      uncertainty: item.expertConsensus.uncertainty === "LOW" ? 0.15 : item.expertConsensus.uncertainty === "HIGH" ? 0.45 : 0.25,
      dividendPerShare: item.financials.dividendPerShare,
      revenuePerShare: item.financials.revenuePerShare,
      ebitdaPerShare: item.financials.ebitdaPerShare,
      ebitPerShare: item.financials.ebitPerShare,
      cashPerShare: item.financials.cashPerShare,
      debtPerShare: item.financials.debtPerShare,
    });

    // Workbook numbers are not source/date verified here; proxies stay labelled.
    const targetSelection = selectLegacyBenchmarkTarget(stock, item.expertConsensus.fairValue);

    sampleItems.push({
      market: item.market,
      ticker: item.ticker,
      name: item.name,
      sector: item.sector,
      price: stock.price,
      stock,
      ...targetSelection,
      models: stock.models,
      financials: item.financials,
    });
  }

  // Additional legacy US rows use self-model proxy answers, not external holdout.
  const additionalTickers = ["NVDA", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "JPM", "V", "UNH", "PG", "HD", "JNJ", "COST", "ABBV", "BAC", "KO", "PEP", "MRK", "AMD", "PLTR", "GE", "CAT", "IBM", "QCOM", "TXN", "INTU", "NOW", "AMAT", "ISRG", "PFE", "SYK", "LOW", "BKNG", "T", "VZ", "NEE", "SCHW", "RTX", "LMT", "DE", "UNP", "SPGI", "GS", "MS", "BLK", "PGR", "C", "AXP", "MCO"];
  
  for (const t of additionalTickers) {
    if (sampleItems.some((s) => s.ticker.toUpperCase() === t)) continue;
    const usRow = usSnapshot.find((r) => r.ticker?.toUpperCase() === t);
    if (!usRow || !usRow.price || !usRow.eps) continue;
    
    const stock = calculateStock({
      ticker: t,
      name: usRow.name || t,
      market: "US",
      sector: usRow.sector || "Technology",
      price: usRow.price,
      eps: usRow.eps,
      bvps: usRow.bvps || 20,
      fcfPerShare: usRow.fcfPerShare || usRow.eps * 0.9,
      targetPe: 22,
      targetPb: 3.5,
      targetFcfMultiple: 24,
      revenueGrowth: usRow.revenueGrowth || 12,
      roe: usRow.financialLeverage && usRow.netMargin ? usRow.netMargin * usRow.financialLeverage : 18,
      debtRatio: usRow.debtRatio || 45,
      uncertainty: 0.2,
      revenuePerShare: usRow.revenuePerShare,
      ebitdaPerShare: usRow.ebitdaPerShare,
      ebitPerShare: usRow.ebitPerShare,
      cashPerShare: usRow.cashPerShare,
      debtPerShare: usRow.debtPerShare,
      dividendPerShare: usRow.dividendPerShare,
    });

    const targetSelection = selectLegacyBenchmarkTarget(stock);

    sampleItems.push({
      market: "US",
      ticker: t,
      name: usRow.name,
      sector: stock.sector,
      price: stock.price,
      stock,
      ...targetSelection,
      models: stock.models,
      financials: {
        eps: usRow.eps,
        bvps: usRow.bvps,
        fcfPerShare: usRow.fcfPerShare,
        revenueGrowth: usRow.revenueGrowth,
        roe: 18,
        debtRatio: usRow.debtRatio,
      },
    });
  }

  console.log(`[Dataset] Total Evaluation Universe Size: ${sampleItems.length} stocks (TW: ${sampleItems.filter((s) => s.market === "TW").length}, US: ${sampleItems.filter((s) => s.market === "US").length})`);

  // Train / Holdout split (80% Train, 20% Holdout)
  const trainItems = sampleItems.slice(0, Math.floor(sampleItems.length * 0.8));
  const holdoutItems = sampleItems.slice(Math.floor(sampleItems.length * 0.8));

  console.log(`[Slices] First 80% (not fitted): ${trainItems.length} | Last 20% (not independent holdout): ${holdoutItems.length}`);

  // -------------------------------------------------------------
  // EXPERIMENT DEFINITIONS (Methods A through P)
  // -------------------------------------------------------------

  const experiments = [
    {
      id: "A",
      name: "Method A: Existing WenYing Family-Balanced Average",
      predict: (item) => item.stock.fairValue,
      isPriceDependent: false,
    },
    {
      id: "B",
      name: "Method B: Simple Equal-Weighted Average of Valid Models",
      predict: (item) => {
        const valid = item.models.filter((m) => m.value > 0);
        return valid.length > 0 ? mean(valid.map((m) => m.value)) : item.stock.fairValue;
      },
      isPriceDependent: false,
    },
    {
      id: "C",
      name: "Method C: Legacy Fixed Model Weights (not measured historical errors)",
      predict: (item) => {
        const valid = item.models.filter((m) => m.value > 0);
        if (valid.length === 0) return item.stock.fairValue;
        // Models with lower variance/error get higher weight: DCF & PE get 1.4x, Asset/Graham get 0.7x
        const modelWeights = {
          "dcf-fcf-5y": 1.4,
          "dcf-fcf-10y": 1.3,
          "dcf-ebitda-5y": 1.3,
          "dcf-revenue-5y": 1.1,
          "pe": 1.3,
          "pe-peer": 1.2,
          "p-fcf": 1.2,
          "ev-ebitda": 1.2,
          "ev-revenue": 1.0,
          "p-sales": 0.9,
          "pb": 0.7,
          "graham": 0.5,
          "epv": 0.8,
          "roe-residual": 1.1,
          "ddm-stable": 1.0,
          "p-ffo": 1.5,
        };
        let totalW = 0;
        let sum = 0;
        for (const m of valid) {
          const w = modelWeights[m.id] ?? 1.0;
          sum += m.value * w;
          totalW += w;
        }
        return totalW > 0 ? sum / totalW : item.stock.fairValue;
      },
      isPriceDependent: false,
    },
    {
      id: "D",
      name: "Method D: Legacy Fixed Family Weights (not measured historical errors)",
      predict: (item) => {
        const valid = item.models.filter((m) => m.value > 0);
        if (valid.length === 0) return item.stock.fairValue;
        const familyWeights = {
          "cashflow-dcf": 1.5,
          "operating-dcf": 1.4,
          "earnings-relative": 1.3,
          "enterprise-relative": 1.2,
          "cashflow-relative": 1.2,
          "sales-relative": 0.9,
          "residual-income": 1.1,
          "income": 1.0,
          "asset": 0.6,
          "fund": 1.0,
        };
        const familySums = new Map();
        const familyCounts = new Map();
        for (const m of valid) {
          familySums.set(m.family, (familySums.get(m.family) ?? 0) + m.value);
          familyCounts.set(m.family, (familyCounts.get(m.family) ?? 0) + 1);
        }
        let totalW = 0;
        let sum = 0;
        for (const [fam, famSum] of familySums.entries()) {
          const famAvg = famSum / familyCounts.get(fam);
          const w = familyWeights[fam] ?? 1.0;
          sum += famAvg * w;
          totalW += w;
        }
        return totalW > 0 ? sum / totalW : item.stock.fairValue;
      },
      isPriceDependent: false,
    },
    {
      id: "E",
      name: "Method E: Sector-Adaptive Grouped Weights",
      predict: (item) => {
        const valid = item.models.filter((m) => m.value > 0);
        if (valid.length === 0) return item.stock.fairValue;
        const sector = (item.sector || "").toLowerCase();
        let selectedModels = valid;
        if (sector.includes("finance") || sector.includes("bank") || sector.includes("insurance") || sector.includes("金融")) {
          selectedModels = valid.filter((m) => m.family === "earnings-relative" || m.family === "asset" || m.family === "residual-income" || m.family === "income");
        } else if (sector.includes("reit") || sector.includes("real estate") || sector.includes("不動產")) {
          selectedModels = valid.filter((m) => m.id === "p-ffo" || m.family === "income" || m.family === "asset");
        } else if (sector.includes("tech") || sector.includes("software") || sector.includes("semiconductor") || sector.includes("科技") || sector.includes("半導體")) {
          selectedModels = valid.filter((m) => m.id !== "pb" && m.id !== "graham");
        }
        const useModels = selectedModels.length > 0 ? selectedModels : valid;
        return mean(useModels.map((m) => m.value));
      },
      isPriceDependent: false,
    },
    {
      id: "F",
      name: "Method F: Life-Cycle & Profitability Gated Selection",
      predict: (item) => {
        const valid = item.models.filter((m) => m.value > 0);
        if (valid.length === 0) return item.stock.fairValue;
        const growth = item.financials?.revenueGrowth ?? 10;
        const roe = item.financials?.roe ?? 15;
        let filtered = valid;
        if (growth > 25) {
          // High growth: exclude pure zero-growth EPV and Graham
          filtered = valid.filter((m) => m.id !== "epv" && m.id !== "graham");
        } else if (growth < 3 && roe < 10) {
          // Mature low growth: upweight EPV, DDM, P/B
          filtered = valid.filter((m) => m.family !== "sales-relative");
        }
        return filtered.length > 0 ? mean(filtered.map((m) => m.value)) : item.stock.fairValue;
      },
      isPriceDependent: false,
    },
    {
      id: "G",
      name: "Method G: Log-Scale Geometric Weighted Average",
      predict: (item) => {
        const valid = item.models.filter((m) => m.value > 0);
        if (valid.length === 0) return item.stock.fairValue;
        const logSum = valid.reduce((sum, m) => sum + Math.log(m.value), 0);
        return Math.exp(logSum / valid.length);
      },
      isPriceDependent: false,
    },
    {
      id: "H",
      name: "Method H: Robust Estimators (Trimmed & Winsorized Mean)",
      predict: (item) => {
        const valid = item.models.filter((m) => m.value > 0);
        if (valid.length === 0) return item.stock.fairValue;
        const values = valid.map((m) => m.value);
        return winsorizedMean(values, 0.15);
      },
      isPriceDependent: false,
    },
    {
      id: "I",
      name: "Method I: Extreme Outlier Filtering with Market Price Bounds [0.25P, 4.0P]",
      predict: (item) => {
        const p = item.price;
        if (!p || p <= 0) return item.stock.fairValue;
        const bounded = item.models.filter((m) => m.value >= p * 0.25 && m.value <= p * 4.0);
        return bounded.length > 0 ? mean(bounded.map((m) => m.value)) : item.stock.fairValue;
      },
      isPriceDependent: true,
    },
    {
      id: "J",
      name: "Method J: Pure Intrinsic Filtering without Market Price (MAD in Log-Space)",
      predict: (item) => {
        const valid = item.models.filter((m) => m.value > 0);
        if (valid.length < 3) return item.stock.fairValue;
        const logVals = valid.map((m) => Math.log(m.value));
        const medLog = median(logVals);
        const mad = median(logVals.map((v) => Math.abs(v - medLog)));
        const cutoff = Math.max(2.5 * 1.4826 * mad, Math.log(2.0));
        const kept = valid.filter((m) => Math.abs(Math.log(m.value) - medLog) <= cutoff);
        return kept.length > 0 ? mean(kept.map((m) => m.value)) : item.stock.fairValue;
      },
      isPriceDependent: false,
    },
    {
      id: "K",
      name: "Method K: Legacy Linear Heuristic (not fitted ridge regression)",
      predict: (item) => {
        const dcf = item.models.find((m) => m.id.startsWith("dcf-fcf"))?.value ?? item.stock.fairValue;
        const pe = item.models.find((m) => m.id === "pe" || m.id === "pe-peer")?.value ?? item.stock.fairValue;
        const ev = item.models.find((m) => m.id.startsWith("ev-"))?.value ?? item.stock.fairValue;
        // Ridge weights shrunk toward uniform
        return 0.38 * dcf + 0.34 * pe + 0.28 * ev;
      },
      isPriceDependent: false,
    },
    {
      id: "L",
      name: "Method L: Robust Huber-Style Aggregation (not fitted regression)",
      predict: (item) => {
        const valid = item.models.filter((m) => m.value > 0);
        if (valid.length === 0) return item.stock.fairValue;
        const med = median(valid.map((m) => m.value));
        // Downweight models that deviate from median beyond delta
        const delta = med * 0.3;
        let wSum = 0;
        let weightedVal = 0;
        for (const m of valid) {
          const diff = Math.abs(m.value - med);
          const w = diff <= delta ? 1.0 : delta / diff;
          weightedVal += m.value * w;
          wSum += w;
        }
        return wSum > 0 ? weightedVal / wSum : med;
      },
      isPriceDependent: false,
    },
    {
      id: "M",
      name: "Method M: Legacy Fixed Non-Negative Blend (not fitted NNLS)",
      predict: (item) => {
        // Legacy fixed weights; no training or optimization is performed.
        const valid = item.models.filter((m) => m.value > 0);
        if (valid.length === 0) return item.stock.fairValue;
        const weights = {
          "dcf-fcf-10y": 0.22,
          "dcf-fcf-5y": 0.18,
          "dcf-ebitda-5y": 0.15,
          "pe": 0.15,
          "pe-peer": 0.10,
          "ev-ebitda": 0.10,
          "roe-residual": 0.05,
          "p-fcf": 0.05,
        };
        let totalW = 0;
        let sum = 0;
        for (const m of valid) {
          const w = weights[m.id] ?? 0.04;
          sum += m.value * w;
          totalW += w;
        }
        return totalW > 0 ? sum / totalW : item.stock.fairValue;
      },
      isPriceDependent: false,
    },
    {
      id: "N",
      name: "Method N: Legacy Fixed Non-Linear Heuristic (not trained boosting)",
      predict: (item) => {
        const native = item.stock.fairValue;
        const growth = item.financials?.revenueGrowth ?? 10;
        const roe = item.financials?.roe ?? 15;
        const unc = item.stock.uncertainty;
        // Non-linear adjustments for tail growth and low uncertainty
        const growthAdjustment = growth > 20 ? 1.04 : growth < 0 ? 0.96 : 1.0;
        const roeAdjustment = roe > 25 ? 1.03 : 1.0;
        const uncertaintyDampener = unc > 0.35 ? 0.98 : 1.01;
        return native * growthAdjustment * roeAdjustment * uncertaintyDampener;
      },
      isPriceDependent: false,
    },
    {
      id: "O",
      name: "Method O: Legacy Median/Native Heuristic (not production)",
      predict: (item) => {
        const native = item.stock.fairValue;
        const valid = item.models.filter((m) => m.value > 0);
        if (valid.length === 0) return native;
        const huberVal = median(valid.map((m) => m.value));
        const sector = (item.sector || "").toLowerCase();
        
        // Multi-feature calibrated blending
        let blendFactor = 0.65; // 65% Huber robust center, 35% Native family-balanced
        if (sector.includes("finance") || sector.includes("bank") || sector.includes("reit")) {
          blendFactor = 0.85; // Stronger alignment on specialized sector rules
        }
        const baseCalibrated = huberVal * blendFactor + native * (1 - blendFactor);
        
        // Minor bounded elasticity adjustment for high-profitability quality moat
        const roe = item.financials?.roe ?? 15;
        const growth = item.financials?.revenueGrowth ?? 10;
        const qualityBump = roe >= 25 && growth >= 8 ? 1.025 : 1.0;
        
        return baseCalibrated * qualityBump;
      },
      isPriceDependent: false,
    },
    {
      id: "P",
      name: "Method P: Two-Stage Model Filter + Calibrated Aggregation",
      predict: (item) => {
        // Stage 1: Legacy local eligibility assumptions, not external AI rules.
        const sector = (item.sector || "").toLowerCase();
        const growth = item.financials?.revenueGrowth ?? 10;
        let stage1 = item.models.filter((m) => m.value > 0);
        if (sector.includes("finance") || sector.includes("bank")) {
          stage1 = stage1.filter((m) => ["pe", "pb", "roe-residual", "ddm-stable"].includes(m.id));
        } else if (sector.includes("reit")) {
          stage1 = stage1.filter((m) => ["p-ffo", "ddm-stable"].includes(m.id));
        } else if (growth > 20) {
          stage1 = stage1.filter((m) => m.id !== "epv" && m.id !== "graham");
        }
        if (stage1.length === 0) stage1 = item.models.filter((m) => m.value > 0);
        if (stage1.length === 0) return item.stock.fairValue;

        // Stage 2: Robust trimmed aggregation
        const vals = stage1.map((m) => m.value);
        return trimmedMean(vals, 0.1);
      },
      isPriceDependent: false,
    },
  ];

  // -------------------------------------------------------------
  // RUN BENCHMARK EVALUATIONS
  // -------------------------------------------------------------

  const overallResults = [];
  const holdoutResults = [];
  const sectorBreakdowns = {};
  const marketBreakdowns = {};

  for (const exp of experiments) {
    const overallRecords = sampleItems.map((item) => ({
      ticker: item.ticker,
      market: item.market,
      sector: item.sector,
      price: item.price,
      target: item.target,
      pred: exp.predict(item),
    }));

    const holdoutRecords = holdoutItems.map((item) => ({
      ticker: item.ticker,
      market: item.market,
      sector: item.sector,
      price: item.price,
      target: item.target,
      pred: exp.predict(item),
    }));

    const overallMetrics = evaluatePredictions(overallRecords);
    const holdoutMetrics = evaluatePredictions(holdoutRecords);

    overallResults.push({ id: exp.id, name: exp.name, isPriceDependent: exp.isPriceDependent, ...overallMetrics });
    holdoutResults.push({ id: exp.id, name: exp.name, isPriceDependent: exp.isPriceDependent, ...holdoutMetrics });

    // Sector breakdown for top methods
    if (["A", "B", "L", "O", "P"].includes(exp.id)) {
      const sectors = ["Technology", "Financials", "Health Care", "Industrials", "Consumer Discretionary", "Energy", "Real Estate", "Other"];
      sectorBreakdowns[exp.id] = {};
      for (const sec of sectors) {
        const secRecords = overallRecords.filter((r) => (r.sector || "").toLowerCase().includes(sec.toLowerCase()) || (sec === "Other" && !sectors.slice(0, -1).some((s) => (r.sector || "").toLowerCase().includes(s.toLowerCase()))));
        sectorBreakdowns[exp.id][sec] = evaluatePredictions(secRecords);
      }

      // Market breakdown
      marketBreakdowns[exp.id] = {
        TW: evaluatePredictions(overallRecords.filter((r) => r.market === "TW")),
        US: evaluatePredictions(overallRecords.filter((r) => r.market === "US")),
      };
    }
  }

  // -------------------------------------------------------------
  // PRICE FEATURE ABLATION TEST
  // -------------------------------------------------------------
  console.log("\n>>> Price Feature Ablation Analysis:");
  const priceAblationComparison = {
    priceIndependent: holdoutResults.find((r) => r.id === "O"),
    priceDependent: holdoutResults.find((r) => r.id === "I"),
    baselineNative: holdoutResults.find((r) => r.id === "A"),
  };

  console.table([
    {
      Method: "Baseline Native (Method A)",
      "Price Dependent": "No",
      "Holdout MdAPE": `${formatLegacyMetric(priceAblationComparison.baselineNative.mdape, {percent:true})}`,
      "Holdout MAPE": `${formatLegacyMetric(priceAblationComparison.baselineNative.mape, {percent:true})}`,
      "Direction Acc": `${formatLegacyMetric(priceAblationComparison.baselineNative.directionAccuracy, {percent:true})}`,
      "Spearman Corr": formatLegacyMetric(priceAblationComparison.baselineNative.spearmanCorr),
    },
    {
      Method: "Legacy heuristic (Method O, not production)",
      "Price Dependent": "No",
      "Holdout MdAPE": `${formatLegacyMetric(priceAblationComparison.priceIndependent.mdape, {percent:true})}`,
      "Holdout MAPE": `${formatLegacyMetric(priceAblationComparison.priceIndependent.mape, {percent:true})}`,
      "Direction Acc": `${formatLegacyMetric(priceAblationComparison.priceIndependent.directionAccuracy, {percent:true})}`,
      "Spearman Corr": formatLegacyMetric(priceAblationComparison.priceIndependent.spearmanCorr),
    },
    {
      Method: "Price Bound Filtered (Method I)",
      "Price Dependent": "Yes",
      "Holdout MdAPE": `${formatLegacyMetric(priceAblationComparison.priceDependent.mdape, {percent:true})}`,
      "Holdout MAPE": `${formatLegacyMetric(priceAblationComparison.priceDependent.mape, {percent:true})}`,
      "Direction Acc": `${formatLegacyMetric(priceAblationComparison.priceDependent.directionAccuracy, {percent:true})}`,
      "Spearman Corr": formatLegacyMetric(priceAblationComparison.priceDependent.spearmanCorr),
    },
  ]);

  console.log("\n>>> Benchmark Results Table (Holdout Dataset):");
  console.table(
    holdoutResults.map((r) => ({
      ID: r.id,
      Method: r.name.split(":")[1]?.trim() || r.name,
      "Price Dep": r.isPriceDependent ? "Yes" : "No",
      "Holdout MdAPE": `${formatLegacyMetric(r.mdape, {percent:true})}`,
      "Holdout MAPE": `${formatLegacyMetric(r.mape, {percent:true})}`,
      "Med Signed Err": `${formatLegacyMetric(r.medianSignedError, {percent:true})}`,
      "Dir Acc": `${formatLegacyMetric(r.directionAccuracy, {percent:true})}`,
      "Rank Corr": formatLegacyMetric(r.spearmanCorr),
      "±10% Hit": `${formatLegacyMetric(r.within10Pct, {percent:true})}`,
    })),
  );

  // Write a private diagnostic without overwriting the historical report.
  await generateBenchmarkMarkdown({
    overallResults,
    holdoutResults,
    sectorBreakdowns,
    marketBreakdowns,
    fileHash,
    datasetHash,
    sampleCount: sampleItems.length,
    trainCount: trainItems.length,
    holdoutCount: holdoutItems.length,
    targetProvenance: { overall: summarizeLegacyTargets(sampleItems), holdout: summarizeLegacyTargets(holdoutItems) },
  });

  console.log(`\n[Benchmark Report] Successfully generated: ${benchmarkOutputPath}`);
  return { overallResults, holdoutResults, sectorBreakdowns, marketBreakdowns };
}

async function generateBenchmarkMarkdown(data) {
  await fs.writeFile(benchmarkOutputPath, renderLegacyBenchmarkReport(data), "utf8");
}

if (process.argv[1] && process.argv[1].endsWith("benchmark-expert-consensus-calibration.mjs")) {
  runValuationBenchmark().catch((err) => {
    console.error("Benchmark failed:", err);
    process.exit(1);
  });
}
