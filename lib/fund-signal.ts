import { normalizeSector } from "./sector-normalization.ts";

export type InstitutionalChangeType = "new" | "increased" | "reduced" | "unchanged";

export type InstitutionalHoldingSignal = {
  ticker: string;
  fundName: string;
  changeType: InstitutionalChangeType;
  changePercent: number | null;
  valueUsd: number;
};

export type FundPortfolioPeSummary = {
  sampleSize: number;
  uniqueSampleSize: number;
  averagePe: number;
  medianPe: number;
  lowerQuartilePe: number;
  upperQuartilePe: number;
  p90Pe: number;
  p95Pe: number;
  valueWeightedAveragePe: number | null;
  lowestPe: number;
  highestPe: number;
  uniqueAveragePe: number;
  uniqueMedianPe: number;
  uniqueLowerQuartilePe: number;
  uniqueUpperQuartilePe: number;
  uniqueP95Pe: number;
  freshSampleSize: number;
  agingSampleSize: number;
  staleSampleSize: number;
  unknownSampleSize: number;
  uniqueFreshSampleSize: number;
  uniqueAgingSampleSize: number;
  uniqueStaleSampleSize: number;
  uniqueUnknownSampleSize: number;
  medianFinancialAgeDays: number | null;
  oldestFinancialDataDate?: string;
  dataQuality: FundPeDataQuality;
  reportDate?: string;
  filingDate?: string;
};

export type FundPeDataQuality = "fresh" | "mixed" | "stale" | "unknown";

export type FundPeReference = {
  ticker: string;
  name?: string;
  pe?: number;
  price?: number;
  eps?: number;
  sector?: string;
  financialDataDate?: string | null;
};

export type FundSectorPeProfile = {
  sector: string;
  sampleSize: number;
  /** Number of distinct tickers in the sector; sampleSize counts fund observations. */
  uniqueSampleSize?: number;
  uniqueMedianPe?: number;
  uniqueLowerQuartilePe?: number;
  uniqueUpperQuartilePe?: number;
  uniqueP95Pe?: number;
  averagePe: number;
  medianPe: number;
  lowerQuartilePe: number;
  upperQuartilePe: number;
  p95Pe: number;
  valueWeightedAveragePe: number | null;
  totalValueUsd: number;
  increasedCount: number;
  reducedCount: number;
  freshSampleSize: number;
  agingSampleSize: number;
  staleSampleSize: number;
  unknownSampleSize: number;
  medianFinancialAgeDays: number | null;
  oldestFinancialDataDate?: string;
  dataQuality: FundPeDataQuality;
};

export type FundBusinessGroup =
  | "memory-cycle"
  | "ai-semiconductor"
  | "platform-software"
  | "ev-optionality"
  | "financial-information"
  | "industrial-transport"
  | "consumer-retail"
  | "healthcare"
  | "real-estate"
  | "energy-materials"
  | "telecom-media"
  | "other";

export type FundBusinessPeProfile = {
  group: FundBusinessGroup;
  sampleSize: number;
  uniqueSampleSize: number;
  averagePe: number;
  medianPe: number;
  lowerQuartilePe: number;
  upperQuartilePe: number;
  p95Pe: number;
  /** P/E distribution after collapsing repeated holdings to one ticker. */
  uniqueAveragePe?: number;
  uniqueMedianPe?: number;
  uniqueLowerQuartilePe?: number;
  uniqueUpperQuartilePe?: number;
  uniqueP95Pe?: number;
  increasedCount: number;
  reducedCount: number;
  freshSampleSize: number;
  agingSampleSize: number;
  staleSampleSize: number;
  unknownSampleSize: number;
  medianFinancialAgeDays: number | null;
  dataQuality: FundPeDataQuality;
  tickers: string[];
};

export type FundManagerPeProfile = {
  fundName: string;
  rank: number;
  holdingCount: number;
  sampleSize: number;
  uniqueSampleSize: number;
  medianPe: number;
  lowerQuartilePe: number;
  upperQuartilePe: number;
  p95Pe: number;
  increasedCount: number;
  reducedCount: number;
  medianFinancialAgeDays: number | null;
  dataQuality: FundPeDataQuality;
  topBusinessGroups: Array<{
    group: FundBusinessGroup;
    sampleSize: number;
    medianPe: number;
  }>;
};

export type FundOverlapProfile = {
  ticker: string;
  sector: string;
  fundCount: number;
  increasedCount: number;
  reducedCount: number;
  newCount: number;
  unchangedCount: number;
  averageChangePercent: number | null;
  totalValueUsd: number;
  pe: number | null;
};

export type InstitutionalSignal = {
  trackedFundCount: number;
  heldByCount: number;
  increasedByCount: number;
  reducedByCount: number;
  newByCount: number;
  unchangedByCount: number;
  holdings: InstitutionalHoldingSignal[];
  reportDate?: string;
  filingDate?: string;
};

type FundHoldingRow = {
  ticker?: string;
  changeType?: string;
  changePercent?: number | null;
  valueUsd?: number;
};

type FundRow = {
  rank?: number;
  name?: string;
  reportDate?: string;
  filingDate?: string;
  holdings?: FundHoldingRow[];
};

export type FundSignalSnapshot = {
  funds?: FundRow[];
};

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/\.(TW|TWO)$/, "");
}

function normalizeChangeType(value: string | undefined, changePercent: number | null) {
  if (value === "new" || value === "increased" || value === "reduced" || value === "unchanged") return value;
  if (changePercent !== null && changePercent > 0) return "increased" as const;
  if (changePercent !== null && changePercent < 0) return "reduced" as const;
  return "unchanged" as const;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(values: number[], probability: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * Math.min(Math.max(probability, 0), 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function referencePe(reference: FundPeReference | undefined) {
  if (!reference) return 0;
  const supplied = Number(reference.pe);
  if (Number.isFinite(supplied) && supplied > 0) return supplied;
  const price = Number(reference.price);
  const eps = Number(reference.eps);
  return Number.isFinite(price) && price > 0 && Number.isFinite(eps) && eps > 0
    ? price / eps
    : 0;
}

const BUSINESS_GROUP_TICKERS: Readonly<Record<FundBusinessGroup, ReadonlySet<string>>> = {
  "memory-cycle": new Set(["MU", "SIMO", "SNDK", "WDC", "STX"]),
  "ai-semiconductor": new Set(["NVDA", "AMD", "AVGO", "LRCX", "AMAT", "KLAC", "MRVL", "ARM"]),
  "platform-software": new Set(["MSFT", "GOOGL", "GOOG", "META", "AMZN", "PINS"]),
  "ev-optionality": new Set(["TSLA", "RIVN", "LCID", "NIO", "LI", "XPEV"]),
  "financial-information": new Set(["MCO", "SPGI", "MSCI", "ICE", "CME", "NDAQ"]),
  "industrial-transport": new Set(["NSC", "ORN", "GE", "GEV", "UNP", "CSX", "CNI", "CP"]),
  "consumer-retail": new Set(["HD", "LOW", "ETSY", "LUV", "PEP"]),
  "healthcare": new Set(["BSX", "UNH", "LLY", "PFE"]),
  "real-estate": new Set(["EQIX", "CCI", "UNIT", "AMT"]),
  "energy-materials": new Set(["PSX", "CNR", "NEM", "FCX"]),
  "telecom-media": new Set(["WBD", "VZ"]),
  other: new Set(),
};

/**
 * A deliberately small, auditable business-model map for the published
 * six-fund top holdings. It is a grouping aid, not an industry forecast. Any
 * ticker not in the map falls back to `other` rather than being guessed from
 * a noisy sector label.
 */
export function businessGroupForTicker(ticker: string): FundBusinessGroup {
  const normalized = normalizeTicker(ticker);
  for (const [group, tickers] of Object.entries(BUSINESS_GROUP_TICKERS) as Array<[FundBusinessGroup, ReadonlySet<string>]>) {
    if (tickers.has(normalized)) return group;
  }
  return "other";
}

function ageDays(value: string | null | undefined, asOf: Date) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const days = Math.floor((asOf.getTime() - date.getTime()) / 86400000);
  return Math.max(0, days);
}

function ageBucket(age: number | null): "fresh" | "aging" | "stale" | "unknown" {
  if (age === null) return "unknown";
  if (age <= 120) return "fresh";
  if (age <= 240) return "aging";
  return "stale";
}

function qualityFromCounts(
  fresh: number,
  aging: number,
  stale: number,
  unknown: number,
): FundPeDataQuality {
  const known = fresh + aging + stale;
  if (known === 0) return "unknown";
  if (stale === known) return "stale";
  if (fresh === known && unknown === 0) return "fresh";
  return "mixed";
}

function qualityCounts(rows: Array<{ financialDataDate?: string | null }>, asOf: Date) {
  const ages = rows.map((row) => ageDays(row.financialDataDate, asOf));
  const buckets = ages.map(ageBucket);
  const numericAges = ages.filter((age): age is number => age !== null);
  const dates = rows
    .map((row) => row.financialDataDate)
    .filter((value): value is string => Boolean(value));
  return {
    fresh: buckets.filter((bucket) => bucket === "fresh").length,
    aging: buckets.filter((bucket) => bucket === "aging").length,
    stale: buckets.filter((bucket) => bucket === "stale").length,
    unknown: buckets.filter((bucket) => bucket === "unknown").length,
    medianAge: numericAges.length > 0 ? median(numericAges) : null,
    oldestDate: dates.sort()[0],
    quality: qualityFromCounts(
      buckets.filter((bucket) => bucket === "fresh").length,
      buckets.filter((bucket) => bucket === "aging").length,
      buckets.filter((bucket) => bucket === "stale").length,
      buckets.filter((bucket) => bucket === "unknown").length,
    ),
  };
}

/**
 * Calculates the trailing P/E profile of the latest six funds' published top
 * holdings. It is a market-context statistic, not an intrinsic-value input.
 */
export function fundPortfolioPeSummary(
  snapshot: FundSignalSnapshot,
  references: FundPeReference[],
  asOf: Date | string = new Date(),
): FundPortfolioPeSummary | undefined {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const referenceByTicker = new Map(
    references.map((reference) => [normalizeTicker(reference.ticker), reference]),
  );
  const funds = [...(snapshot.funds ?? [])]
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 6);
  const rows = funds.flatMap((fund) => (fund.holdings ?? []).map((holding) => {
    const pe = referencePe(referenceByTicker.get(normalizeTicker(holding.ticker ?? "")));
    const valueUsd = typeof holding.valueUsd === "number" && Number.isFinite(holding.valueUsd)
      ? holding.valueUsd
      : 0;
    return { pe, valueUsd, financialDataDate: referenceByTicker.get(normalizeTicker(holding.ticker ?? ""))?.financialDataDate };
  })).filter((row) => row.pe > 0 && Number.isFinite(row.pe));
  if (rows.length === 0) return undefined;

  const uniqueRows = [...new Map(funds.flatMap((fund) => (fund.holdings ?? []).map((holding) => {
    const ticker = normalizeTicker(holding.ticker ?? "");
    const reference = referenceByTicker.get(ticker);
    const pe = referencePe(reference);
    return [ticker, { pe, financialDataDate: reference?.financialDataDate }] as const;
  })).filter(([ticker, row]) => Boolean(ticker) && row.pe > 0 && Number.isFinite(row.pe))).values()];
  const uniquePes = uniqueRows.map((row) => row.pe);
  const sampleQuality = qualityCounts(rows, asOfDate);
  const uniqueQuality = qualityCounts(uniqueRows, asOfDate);

  const pes = rows.map((row) => row.pe);
  const weightedRows = rows.filter((row) => row.valueUsd > 0);
  const totalValue = weightedRows.reduce((sum, row) => sum + row.valueUsd, 0);
  const valueWeightedAveragePe = totalValue > 0
    ? weightedRows.reduce((sum, row) => sum + row.pe * row.valueUsd, 0) / totalValue
    : null;
  return {
    sampleSize: pes.length,
    uniqueSampleSize: uniquePes.length,
    averagePe: pes.reduce((sum, pe) => sum + pe, 0) / pes.length,
    medianPe: median(pes),
    lowerQuartilePe: percentile(pes, 0.25),
    upperQuartilePe: percentile(pes, 0.75),
    p90Pe: percentile(pes, 0.9),
    p95Pe: percentile(pes, 0.95),
    valueWeightedAveragePe,
    lowestPe: Math.min(...pes),
    highestPe: Math.max(...pes),
    uniqueAveragePe: uniquePes.reduce((sum, pe) => sum + pe, 0) / uniquePes.length,
    uniqueMedianPe: median(uniquePes),
    uniqueLowerQuartilePe: percentile(uniquePes, 0.25),
    uniqueUpperQuartilePe: percentile(uniquePes, 0.75),
    uniqueP95Pe: percentile(uniquePes, 0.95),
    freshSampleSize: sampleQuality.fresh,
    agingSampleSize: sampleQuality.aging,
    staleSampleSize: sampleQuality.stale,
    unknownSampleSize: sampleQuality.unknown,
    uniqueFreshSampleSize: uniqueQuality.fresh,
    uniqueAgingSampleSize: uniqueQuality.aging,
    uniqueStaleSampleSize: uniqueQuality.stale,
    uniqueUnknownSampleSize: uniqueQuality.unknown,
    medianFinancialAgeDays: sampleQuality.medianAge,
    oldestFinancialDataDate: sampleQuality.oldestDate,
    dataQuality: sampleQuality.quality,
    reportDate: funds.map((fund) => fund.reportDate).find(Boolean),
    filingDate: funds.map((fund) => fund.filingDate).find(Boolean),
  };
}

/**
 * Groups the same disclosed holdings by the sector supplied by the market
 * snapshot. This is deliberately descriptive: it does not alter any stock's
 * intrinsic fair value or imply that a fund endorses a particular multiple.
 */
export function fundPortfolioPeProfiles(
  snapshot: FundSignalSnapshot,
  references: FundPeReference[],
  asOf: Date | string = new Date(),
): FundSectorPeProfile[] {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const referenceByTicker = new Map(
    references.map((reference) => [normalizeTicker(reference.ticker), reference]),
  );
  const funds = [...(snapshot.funds ?? [])]
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 6);
  const groups = new Map<string, Array<{ ticker: string; pe: number; valueUsd: number; changeType: InstitutionalChangeType; financialDataDate?: string | null }>>();
  for (const fund of funds) {
    for (const holding of fund.holdings ?? []) {
      const reference = referenceByTicker.get(normalizeTicker(holding.ticker ?? ""));
      const pe = referencePe(reference);
      if (!(pe > 0)) continue;
      const sector = normalizeSector(reference?.ticker, undefined, reference?.sector);
      const valueUsd = typeof holding.valueUsd === "number" && Number.isFinite(holding.valueUsd)
        ? holding.valueUsd
        : 0;
      const changePercent = typeof holding.changePercent === "number" && Number.isFinite(holding.changePercent)
        ? holding.changePercent
        : null;
      const changeType = normalizeChangeType(holding.changeType, changePercent);
      const rows = groups.get(sector) ?? [];
      rows.push({ ticker: normalizeTicker(holding.ticker ?? ""), pe, valueUsd, changeType, financialDataDate: reference?.financialDataDate });
      groups.set(sector, rows);
    }
  }
  return [...groups.entries()]
    .map(([sector, rows]) => {
      const pes = rows.map((row) => row.pe);
      const uniquePes = [...new Map(rows.map((row) => [row.ticker, row.pe] as const)).values()];
      const quality = qualityCounts(rows, asOfDate);
      const weightedRows = rows.filter((row) => row.valueUsd > 0);
      const totalValueUsd = weightedRows.reduce((sum, row) => sum + row.valueUsd, 0);
      return {
        sector,
        sampleSize: pes.length,
        uniqueSampleSize: uniquePes.length,
        uniqueMedianPe: median(uniquePes),
        uniqueLowerQuartilePe: percentile(uniquePes, 0.25),
        uniqueUpperQuartilePe: percentile(uniquePes, 0.75),
        uniqueP95Pe: percentile(uniquePes, 0.95),
        averagePe: pes.reduce((sum, pe) => sum + pe, 0) / pes.length,
        medianPe: median(pes),
        lowerQuartilePe: percentile(pes, 0.25),
        upperQuartilePe: percentile(pes, 0.75),
        p95Pe: percentile(pes, 0.95),
        valueWeightedAveragePe: totalValueUsd > 0
          ? weightedRows.reduce((sum, row) => sum + row.pe * row.valueUsd, 0) / totalValueUsd
          : null,
        totalValueUsd,
        increasedCount: rows.filter((row) => row.changeType === "increased" || row.changeType === "new").length,
        reducedCount: rows.filter((row) => row.changeType === "reduced").length,
        freshSampleSize: quality.fresh,
        agingSampleSize: quality.aging,
        staleSampleSize: quality.stale,
        unknownSampleSize: quality.unknown,
        medianFinancialAgeDays: quality.medianAge,
        oldestFinancialDataDate: quality.oldestDate,
        dataQuality: quality.quality,
      } satisfies FundSectorPeProfile;
    })
    .sort((left, right) => right.totalValueUsd - left.totalValueUsd);
}

/**
 * Groups the same disclosed holdings by a narrow, curated business-model
 * bucket. Unlike a sector profile, this is only emitted for known tickers so
 * a broad vendor sector cannot silently mix memory, software and equipment.
 * It is descriptive market context and never changes intrinsic fair value.
 */
export function fundPortfolioBusinessPeProfiles(
  snapshot: FundSignalSnapshot,
  references: FundPeReference[],
  asOf: Date | string = new Date(),
): FundBusinessPeProfile[] {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const referenceByTicker = new Map(
    references.map((reference) => [normalizeTicker(reference.ticker), reference]),
  );
  const funds = [...(snapshot.funds ?? [])]
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 6);
  const groups = new Map<FundBusinessGroup, Array<{
    ticker: string;
    pe: number;
    changeType: InstitutionalChangeType;
    financialDataDate?: string | null;
  }>>();
  for (const fund of funds) {
    for (const holding of fund.holdings ?? []) {
      const ticker = normalizeTicker(holding.ticker ?? "");
      const group = businessGroupForTicker(ticker);
      if (group === "other") continue;
      const reference = referenceByTicker.get(ticker);
      const pe = referencePe(reference);
      if (!(pe > 0)) continue;
      const changePercent = typeof holding.changePercent === "number" && Number.isFinite(holding.changePercent)
        ? holding.changePercent
        : null;
      const rows = groups.get(group) ?? [];
      rows.push({
        ticker,
        pe,
        changeType: normalizeChangeType(holding.changeType, changePercent),
        financialDataDate: reference?.financialDataDate,
      });
      groups.set(group, rows);
    }
  }
  return [...groups.entries()]
    .map(([group, rows]) => {
      const pes = rows.map((row) => row.pe);
      const uniquePes = [...new Map(rows.map((row) => [row.ticker, row.pe] as const)).values()];
      const quality = qualityCounts(rows, asOfDate);
      return {
        group,
        sampleSize: rows.length,
        uniqueSampleSize: uniquePes.length,
        averagePe: pes.reduce((sum, pe) => sum + pe, 0) / pes.length,
        medianPe: median(pes),
        lowerQuartilePe: percentile(pes, 0.25),
        upperQuartilePe: percentile(pes, 0.75),
        p95Pe: percentile(pes, 0.95),
        uniqueAveragePe: uniquePes.reduce((sum, pe) => sum + pe, 0) / uniquePes.length,
        uniqueMedianPe: median(uniquePes),
        uniqueLowerQuartilePe: percentile(uniquePes, 0.25),
        uniqueUpperQuartilePe: percentile(uniquePes, 0.75),
        uniqueP95Pe: percentile(uniquePes, 0.95),
        increasedCount: rows.filter((row) => row.changeType === "increased" || row.changeType === "new").length,
        reducedCount: rows.filter((row) => row.changeType === "reduced").length,
        freshSampleSize: quality.fresh,
        agingSampleSize: quality.aging,
        staleSampleSize: quality.stale,
        unknownSampleSize: quality.unknown,
        medianFinancialAgeDays: quality.medianAge,
        dataQuality: quality.quality,
        tickers: [...new Set(rows.map((row) => row.ticker))].sort(),
      } satisfies FundBusinessPeProfile;
    })
    .sort((left, right) => right.sampleSize - left.sampleSize || left.group.localeCompare(right.group));
}

/**
 * Produces a manager-by-manager trailing P/E snapshot for the six published
 * portfolios. This is intentionally descriptive: 13F filings do not reveal
 * a manager's entry multiple or target multiple, so the range must never be
 * labelled as an estimate by the fund.
 */
export function fundManagerPeProfiles(
  snapshot: FundSignalSnapshot,
  references: FundPeReference[],
  asOf: Date | string = new Date(),
): FundManagerPeProfile[] {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const referenceByTicker = new Map(
    references.map((reference) => [normalizeTicker(reference.ticker), reference]),
  );
  const funds = [...(snapshot.funds ?? [])]
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 6);
  return funds.map((fund, index) => {
    const holdings = fund.holdings ?? [];
    const rows = holdings.flatMap((holding) => {
      const ticker = normalizeTicker(holding.ticker ?? "");
      const reference = referenceByTicker.get(ticker);
      const pe = referencePe(reference);
      if (!(pe > 0)) return [];
      const changePercent = typeof holding.changePercent === "number" && Number.isFinite(holding.changePercent)
        ? holding.changePercent
        : null;
      return [{
        ticker,
        pe,
        group: businessGroupForTicker(ticker),
        changeType: normalizeChangeType(holding.changeType, changePercent),
        financialDataDate: reference?.financialDataDate,
      }];
    });
    const uniqueRows = [...new Map(rows.map((row) => [row.ticker, row] as const)).values()];
    const pes = uniqueRows.map((row) => row.pe);
    const quality = qualityCounts(rows, asOfDate);
    const groups = new Map<FundBusinessGroup, number[]>();
    rows.forEach((row) => {
      if (row.group === "other") return;
      const values = groups.get(row.group) ?? [];
      values.push(row.pe);
      groups.set(row.group, values);
    });
    const topBusinessGroups = [...groups.entries()]
      .map(([group, values]) => ({ group, sampleSize: values.length, medianPe: median(values) }))
      .sort((left, right) => right.sampleSize - left.sampleSize || right.medianPe - left.medianPe)
      .slice(0, 3);
    return {
      fundName: fund.name ?? `Fund #${index + 1}`,
      rank: fund.rank ?? index + 1,
      holdingCount: holdings.length,
      sampleSize: pes.length,
      uniqueSampleSize: uniqueRows.length,
      medianPe: median(pes),
      lowerQuartilePe: percentile(pes, 0.25),
      upperQuartilePe: percentile(pes, 0.75),
      p95Pe: percentile(pes, 0.95),
      increasedCount: rows.filter((row) => row.changeType === "increased" || row.changeType === "new").length,
      reducedCount: rows.filter((row) => row.changeType === "reduced").length,
      medianFinancialAgeDays: quality.medianAge,
      dataQuality: quality.quality,
      topBusinessGroups,
    } satisfies FundManagerPeProfile;
  }).filter((profile) => profile.sampleSize > 0);
}

/**
 * Finds repeated tickers across the latest six managers' disclosed top
 * holdings.  This is a descriptive crowding/conviction signal: the current
 * P/E is calculated from the public snapshot and is never used as a target
 * multiple or blended into intrinsic fair value.
 */
export function fundPortfolioOverlapProfiles(
  snapshot: FundSignalSnapshot,
  references: FundPeReference[],
  limit = 12,
): FundOverlapProfile[] {
  const referenceByTicker = new Map(
    references.map((reference) => [normalizeTicker(reference.ticker), reference]),
  );
  const funds = [...(snapshot.funds ?? [])]
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 6);
  const groups = new Map<string, Array<{ pe: number; valueUsd: number; changeType: InstitutionalChangeType; changePercent: number | null }>>();
  for (const fund of funds) {
    for (const holding of fund.holdings ?? []) {
      const ticker = normalizeTicker(holding.ticker ?? "");
      if (!ticker) continue;
      const reference = referenceByTicker.get(ticker);
      const changePercent = typeof holding.changePercent === "number" && Number.isFinite(holding.changePercent)
        ? holding.changePercent
        : null;
      const valueUsd = typeof holding.valueUsd === "number" && Number.isFinite(holding.valueUsd)
        ? holding.valueUsd
        : 0;
      const rows = groups.get(ticker) ?? [];
      rows.push({
        pe: referencePe(reference),
        valueUsd,
        changeType: normalizeChangeType(holding.changeType, changePercent),
        changePercent,
      });
      groups.set(ticker, rows);
    }
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length >= 2)
    .map(([ticker, rows]) => {
      const reference = referenceByTicker.get(ticker);
      const changes = rows.map((row) => row.changePercent).filter((value): value is number => value !== null);
      const positivePe = rows.map((row) => row.pe).find((value) => value > 0) ?? null;
      return {
        ticker,
        sector: normalizeSector(ticker, undefined, reference?.sector),
        fundCount: rows.length,
        increasedCount: rows.filter((row) => row.changeType === "increased").length,
        reducedCount: rows.filter((row) => row.changeType === "reduced").length,
        newCount: rows.filter((row) => row.changeType === "new").length,
        unchangedCount: rows.filter((row) => row.changeType === "unchanged").length,
        averageChangePercent: changes.length > 0
          ? changes.reduce((sum, value) => sum + value, 0) / changes.length
          : null,
        totalValueUsd: rows.reduce((sum, row) => sum + row.valueUsd, 0),
        pe: positivePe,
      } satisfies FundOverlapProfile;
    })
    .sort((left, right) => (
      right.fundCount - left.fundCount
      || (right.increasedCount + right.newCount) - (left.increasedCount + left.newCount)
      || right.totalValueUsd - left.totalValueUsd
      || left.ticker.localeCompare(right.ticker)
    ))
    .slice(0, Math.max(0, limit));
}

/**
 * Summarizes the latest six ranked managers' reported long holdings for one ticker.
 * The snapshot only contains the published top holdings, so absence is not proof of
 * a fund having no position. This signal must remain separate from intrinsic value.
 */
export function institutionalSignalForTicker(snapshot: FundSignalSnapshot, ticker: string): InstitutionalSignal | undefined {
  const normalizedTicker = normalizeTicker(ticker);
  const funds = [...(snapshot.funds ?? [])]
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 6);
  const holdings = funds.flatMap((fund) => {
    const row = (fund.holdings ?? []).find((holding) => normalizeTicker(holding.ticker ?? "") === normalizedTicker);
    if (!row) return [];
    const changePercent = typeof row.changePercent === "number" && Number.isFinite(row.changePercent)
      ? row.changePercent
      : null;
    return [{
      ticker: normalizedTicker,
      fundName: fund.name ?? "Unknown fund",
      changeType: normalizeChangeType(row.changeType, changePercent),
      changePercent,
      valueUsd: typeof row.valueUsd === "number" && Number.isFinite(row.valueUsd) ? row.valueUsd : 0,
    } satisfies InstitutionalHoldingSignal];
  });
  if (holdings.length === 0) return undefined;

  const reportDate = funds.map((fund) => fund.reportDate).find(Boolean);
  const filingDate = funds.map((fund) => fund.filingDate).find(Boolean);
  return {
    trackedFundCount: funds.length,
    heldByCount: holdings.length,
    increasedByCount: holdings.filter((holding) => holding.changeType === "increased").length,
    reducedByCount: holdings.filter((holding) => holding.changeType === "reduced").length,
    newByCount: holdings.filter((holding) => holding.changeType === "new").length,
    unchangedByCount: holdings.filter((holding) => holding.changeType === "unchanged").length,
    holdings,
    reportDate,
    filingDate,
  };
}
