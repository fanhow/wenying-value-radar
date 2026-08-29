import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { SpreadsheetFile } from "../work/expert-consensus-training-20260817/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";
import { calculateStock } from "../lib/valuation.ts";
import { normalizeSector } from "../lib/sector-normalization.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const excelPath = path.join(repoRoot, "outputs/expert-consensus-training-20260817/WenYing-Expert-Consensus-Training-Template-2026-08-17.xlsx");
const usSnapshotPath = path.join(repoRoot, "lib/us-market-snapshot.json");
const tpexSnapshotPath = path.join(repoRoot, "lib/tpex-snapshot.json");
const outputJsonPath = path.join(repoRoot, "outputs/expert-consensus-benchmark-dataset.json");

export async function importExpertConsensusTrainingData() {
  const excelBuffer = await fs.readFile(excelPath);
  const fileHash = crypto.createHash("sha256").update(excelBuffer).digest("hex");
  const wb = await SpreadsheetFile.importXlsx(excelBuffer);

  const usSnapshot = JSON.parse(await fs.readFile(usSnapshotPath, "utf8"));
  const tpexSnapshot = JSON.parse(await fs.readFile(tpexSnapshotPath, "utf8"));

  // Build lookup maps
  const usByTicker = new Map();
  for (const row of usSnapshot) {
    if (row.ticker) {
      usByTicker.set(String(row.ticker).toUpperCase(), row);
    }
  }

  const tpexByTicker = new Map();
  for (const row of tpexSnapshot) {
    if (row.ticker) {
      tpexByTicker.set(String(row.ticker).trim(), row);
    }
  }

  // Extract sheets
  const getSheetValues = (sheetName) => {
    const sheet = wb.worksheets.items.find((s) => s.name === sheetName);
    if (!sheet) return [];
    const used = sheet.getUsedRange();
    return used?.values ?? [];
  };

  const fundValues = getSheetValues("六大基金持股");
  const rankValues = getSheetValues("排行前40");
  const universeValues = getSheetValues("標的總表");
  const snapshotSheet = wb.worksheets.items.find((sheet) => sheet.name.endsWith("快照"));
  const snapshotValues = snapshotSheet?.getUsedRange()?.values ?? [];
  const financialValues = getSheetValues("歷史財務資料");
  const modelValues = getSheetValues("模型輸出");

  // Parse Fund holdings
  const fundHoldings = fundValues.slice(1).map((row) => ({
    fundRank: row[0],
    fundName: row[1],
    reportDate: row[2] instanceof Date ? row[2].toISOString().slice(0, 10) : row[2],
    previousReportDate: row[3] instanceof Date ? row[3].toISOString().slice(0, 10) : row[3],
    ticker: row[4],
    name: row[5],
    valueUsd: row[6],
    shares: row[7],
    changeType: row[8],
    changePercent: row[9],
    significantChange: row[10] === "是",
    source: row[11],
  }));

  // Parse Top 40 Rankings
  const top40Rankings = rankValues.slice(1).map((row) => ({
    snapshotDate: row[0] instanceof Date ? row[0].toISOString().slice(0, 10) : row[0],
    overallRank: row[1],
    marketRank: row[2],
    market: row[3],
    ticker: String(row[4]),
    name: row[5],
    sector: row[6],
    price: row[7],
    wenyingFairValue: row[8],
    upside: row[9],
    qualityScore: row[10],
    confidence: row[11],
  }));

  // Parse Universe table (77 stocks)
  const universeList = universeValues.slice(1).map((row) => ({
    market: row[0],
    ticker: String(row[1]),
    name: row[2],
    sources: row[3] ? String(row[3]).split("；") : [],
    funds: row[4] ? String(row[4]).split("；") : [],
    fundCount: row[5] ?? 0,
    overallRank: row[6],
    marketRank: row[7],
    wenyingPrice: row[8],
    wenyingFairValue: row[9],
    wenyingUpside: row[10],
    completionStatus: row[11],
  }));

  // Parse Expert Consensus snapshot table
  const snapshots = snapshotValues.slice(1).map((row) => ({
    snapshotDate: row[0] instanceof Date ? row[0].toISOString().slice(0, 10) : row[0],
    market: row[1],
    ticker: String(row[2]),
    name: row[3],
    expertConsensusSymbol: row[4],
    currency: row[5],
    price: row[6],
    fairValue: row[7],
    spreadLow: row[10],
    spreadHigh: row[11],
    validModelCount: row[12],
    validModelNames: row[13],
    uncertainty: row[9],
    sourceUrl: row[14],
    inputMethod: row[15],
    notes: row[16],
  }));

  const snapshotMap = new Map();
  for (const s of snapshots) {
    snapshotMap.set(`${s.market}:${s.ticker}`, s);
  }

  // Parse historical financial table
  const historicalFinancials = financialValues.slice(1).map((row) => ({
    captureDate: row[0] instanceof Date ? row[0].toISOString().slice(0, 10) : row[0],
    market: row[1],
    ticker: String(row[2]),
    name: row[3],
    periodEnd: row[4] instanceof Date ? row[4].toISOString().slice(0, 10) : row[4],
    periodType: row[5],
    currency: row[6],
    unit: row[7],
    revenue: row[8],
    ebitda: row[9],
    netIncome: row[10],
    cfo: row[11],
    fcf: row[12],
    eps: row[13],
    totalDebt: row[14],
    sourceUrl: row[15],
    notes: row[16],
  }));

  // Parse model output table
  const modelOutputs = modelValues.slice(1).map((row) => ({
    captureDate: row[0] instanceof Date ? row[0].toISOString().slice(0, 10) : row[0],
    market: row[1],
    ticker: String(row[2]),
    name: row[3],
    modelName: row[4],
    price: row[5],
    modelFairValue: row[6],
    rangeLow: row[7],
    rangeHigh: row[8],
    discountRate: row[9],
    terminalGrowth: row[10],
    upside: row[11],
    sourceUrl: row[12],
    notes: row[13],
  }));

  // Construct comprehensive stock entries with WenYing sub-models evaluated
  const benchmarkStocks = [];

  for (const item of universeList) {
    const key = `${item.market}:${item.ticker}`;
    const snap = snapshotMap.get(key);
    const usData = item.market === "US" ? usByTicker.get(item.ticker.toUpperCase()) : null;
    const twData = item.market === "TW" ? tpexByTicker.get(item.ticker) : null;

    let sector = "Other";
    let price = snap?.price ?? item.wenyingPrice ?? usData?.price ?? (twData ? parseFloat(twData.close) : null);
    let eps = usData?.eps ?? null;
    let bvps = usData?.bvps ?? null;
    let fcfPerShare = usData?.fcfPerShare ?? null;
    let revenueGrowth = usData?.revenueGrowth ?? null;
    let roe = usData?.financialLeverage && usData?.netMargin ? usData.netMargin * (usData.assetTurnover || 1) * usData.financialLeverage : null;
    let debtRatio = usData?.debtRatio ?? null;
    let dividendPerShare = usData?.dividendPerShare ?? null;
    let revenuePerShare = usData?.revenuePerShare ?? null;
    let ebitdaPerShare = usData?.ebitdaPerShare ?? null;
    let ebitPerShare = usData?.ebitPerShare ?? null;
    let cashPerShare = usData?.cashPerShare ?? null;
    let debtPerShare = usData?.debtPerShare ?? null;

    if (item.market === "US" && usData) {
      sector = usData.sector || normalizeSector(item.ticker, item.name, usData.sector);
    } else if (item.market === "TW") {
      const top40Match = top40Rankings.find((r) => r.market === "TW" && r.ticker === item.ticker);
      if (top40Match) {
        sector = top40Match.sector;
      }
      sector = normalizeSector(item.ticker, item.name, sector);
    }

    // Build StockInput
    const stockInput = {
      ticker: item.ticker,
      name: item.name || (usData?.name ?? twData?.name ?? item.ticker),
      market: item.market,
      sector,
      price: typeof price === "number" && Number.isFinite(price) ? price : 100,
      eps: typeof eps === "number" && Number.isFinite(eps) ? eps : 5,
      bvps: typeof bvps === "number" && Number.isFinite(bvps) ? bvps : 30,
      fcfPerShare: typeof fcfPerShare === "number" && Number.isFinite(fcfPerShare) ? fcfPerShare : 4,
      targetPe: 18,
      targetPb: 2.5,
      targetFcfMultiple: 20,
      revenueGrowth: typeof revenueGrowth === "number" && Number.isFinite(revenueGrowth) ? revenueGrowth : 10,
      roe: typeof roe === "number" && Number.isFinite(roe) ? roe : 15,
      debtRatio: typeof debtRatio === "number" && Number.isFinite(debtRatio) ? debtRatio : 40,
      uncertainty: snap?.uncertainty === "LOW" ? 0.15 : snap?.uncertainty === "HIGH" ? 0.45 : 0.25,
      dividendPerShare: dividendPerShare ?? undefined,
      revenuePerShare: revenuePerShare ?? undefined,
      ebitdaPerShare: ebitdaPerShare ?? undefined,
      ebitPerShare: ebitPerShare ?? undefined,
      cashPerShare: cashPerShare ?? undefined,
      debtPerShare: debtPerShare ?? undefined,
      dataBasis: usData?.dataBasis || "annual",
      financialDataDate: usData?.financialDataDate || usData?.date,
    };

    const calculated = calculateStock(stockInput);

    benchmarkStocks.push({
      market: item.market,
      ticker: item.ticker,
      name: stockInput.name,
      sector: stockInput.sector,
      price,
      financials: {
        eps,
        bvps,
        fcfPerShare,
        revenueGrowth,
        roe,
        debtRatio,
        dividendPerShare,
        revenuePerShare,
        ebitdaPerShare,
        ebitPerShare,
        cashPerShare,
        debtPerShare,
      },
      sources: item.sources,
      funds: item.funds,
      fundCount: item.fundCount,
      overallRank: item.overallRank,
      marketRank: item.marketRank,
      expertConsensus: {
        hasTarget: snap?.fairValue !== null && snap?.fairValue !== undefined && Number(snap.fairValue) > 0,
        fairValue: snap?.fairValue ? Number(snap.fairValue) : null,
        spreadLow: snap?.spreadLow ? Number(snap.spreadLow) : null,
        spreadHigh: snap?.spreadHigh ? Number(snap.spreadHigh) : null,
        uncertainty: snap?.uncertainty || null,
        validModelCount: snap?.validModelCount ? Number(snap.validModelCount) : null,
        validModelNames: snap?.validModelNames || null,
        sourceUrl: snap?.sourceUrl || null,
      },
      wenyingNative: {
        fairValue: calculated.fairValue,
        rangeLow: calculated.rangeLow,
        rangeHigh: calculated.rangeHigh,
        upside: calculated.upside,
        confidence: calculated.valuationConfidence,
        risk: calculated.risk,
        qualityScore: calculated.qualityScore,
        wacc: calculated.wacc,
        discountRate: calculated.discountRate,
        terminalGrowth: calculated.terminalGrowth,
        appliedModels: calculated.models.map((m) => ({
          id: m.id,
          category: m.category,
          family: m.family,
          label: m.label,
          value: m.value,
          weight: m.weight,
          rangeLow: m.rangeLow,
          rangeHigh: m.rangeHigh,
        })),
        excludedModels: calculated.excludedModels.map((m) => ({
          id: m.id,
          category: m.category,
          label: m.label,
          reason: m.reason,
        })),
      },
    });
  }

  const dataset = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceFile: "WenYing-Expert Consensus-Training-Template-2026-08-17.xlsx",
      sourceFileSha256: fileHash,
      universeCount: universeList.length,
      fundRowCount: fundHoldings.length,
      rankingRowCount: top40Rankings.length,
      historicalFinancialRowCount: historicalFinancials.length,
      modelOutputRowCount: modelOutputs.length,
      snapshotRowCount: snapshots.length,
    },
    universe: benchmarkStocks,
    fundHoldings,
    top40Rankings,
    historicalFinancials,
    modelOutputs,
  };

  await fs.mkdir(path.dirname(outputJsonPath), { recursive: true });
  await fs.writeFile(outputJsonPath, JSON.stringify(dataset, null, 2), "utf8");

  const datasetHash = crypto.createHash("sha256").update(JSON.stringify(dataset)).digest("hex");
  console.log(`[Import] Successfully imported Expert Consensus training workbook.`);
  console.log(`[Import] Source Excel Hash: ${fileHash}`);
  console.log(`[Import] Output Dataset Path: ${outputJsonPath}`);
  console.log(`[Import] Dataset Hash: ${datasetHash}`);
  console.log(`[Import] Universe Tickers: ${benchmarkStocks.length}`);

  return { dataset, fileHash, datasetHash };
}

if (process.argv[1] && process.argv[1].endsWith("import-expert-consensus-training-data.mjs")) {
  importExpertConsensusTrainingData().catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  });
}
