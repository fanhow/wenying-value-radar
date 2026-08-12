/**
 * Public-market comparable multiples.
 *
 * This module deliberately uses only observed prices and public per-share
 * financial fields. It does not use analyst estimates, price targets, or a
 * company's own P/E to manufacture an EV multiple.
 */

import { normalizeSector } from "./sector-normalization.ts";
import { businessGroupForTicker } from "./fund-signal.ts";

export type ComparableRow = {
  ticker: string;
  market?: string;
  name?: string | null;
  sector?: string | null;
  price?: number | string | null;
  eps?: number | string | null;
  revenuePerShare?: number | string | null;
  ebitdaPerShare?: number | string | null;
  ebitPerShare?: number | string | null;
  ffoPerShare?: number | string | null;
  affoPerShare?: number | string | null;
  cashPerShare?: number | string | null;
  debtPerShare?: number | string | null;
  marketCap?: number | string | null;
  dataBasis?: string | null;
  financialDataDate?: string | null;
  date?: string | null;
};

export type ComparableMultiples = {
  sector: string;
  /** Narrow business-model peer label when a curated group is available. */
  peerGroup?: string;
  market: string;
  peerCount: number;
  pePeerCount: number;
  psPeerCount: number;
  evRevenuePeerCount: number;
  evEbitdaPeerCount: number;
  evEbitPeerCount: number;
  pFfoPeerCount: number;
  peMedian: number | null;
  psMedian: number | null;
  evRevenueMedian: number | null;
  evEbitdaMedian: number | null;
  evEbitMedian: number | null;
  pFfoMedian: number | null;
  dataBasis: string;
  asOf: string | null;
  method: "sector-trimmed-median" | "business-group-trimmed-median" | "business-group-with-sector-fallback";
};

const MIN_PEERS = 5;
// A narrow, curated business group is allowed one fewer peer than a broad
// sector. The UI and method label keep that smaller sample visible.
const MIN_BUSINESS_GROUP_PEERS = 4;
const MULTIPLE_CAPS = {
  pe: 300,
  ps: 50,
  evRevenue: 50,
  evEbitda: 100,
  evEbit: 100,
  pFfo: 60,
} as const;

type MultipleValues = Record<keyof typeof MULTIPLE_CAPS, number>;
const multipleCache = new WeakMap<ComparableRow, MultipleValues>();

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function sectorKey(value: unknown) {
  const sector = String(value ?? "").trim();
  return sector || "Other / unavailable";
}

function rowSector(row: ComparableRow) {
  return sectorKey(normalizeSector(row.ticker, row.name, row.sector));
}

function rowPeerGroup(row: ComparableRow) {
  const group = businessGroupForTicker(row.ticker);
  return group === "other" ? null : group;
}

function marketKey(value: unknown) {
  const market = String(value ?? "").trim().toUpperCase();
  return market || "US";
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(values: number[], probability: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/** Remove only the tails that are clearly not a useful sector benchmark. */
function trimmedMultiple(values: number[], cap: number, minPeers = MIN_PEERS) {
  const finite = values.filter((value) => Number.isFinite(value) && value > 0 && value <= cap);
  if (finite.length < minPeers) return { value: null, count: finite.length };
  const low = percentile(finite, 0.05);
  const high = percentile(finite, 0.95);
  const trimmed = finite.filter((value) => value >= low && value <= high);
  return { value: median(trimmed), count: finite.length };
}

function netDebtPerShare(row: ComparableRow) {
  return numeric(row.debtPerShare) - numeric(row.cashPerShare);
}

function comparableMultiple(row: ComparableRow, kind: keyof typeof MULTIPLE_CAPS) {
  const cached = multipleCache.get(row);
  if (cached) return cached[kind];
  const price = numeric(row.price);
  const eps = numeric(row.eps);
  const revenue = numeric(row.revenuePerShare);
  const ebitda = numeric(row.ebitdaPerShare);
  const ebit = numeric(row.ebitPerShare);
  const ffo = numeric(row.affoPerShare ?? row.ffoPerShare);
  const enterprisePrice = price + netDebtPerShare(row);
  const values: MultipleValues = {
    pe: price > 0 && eps > 0 ? price / eps : 0,
    ps: price > 0 && revenue > 0 ? price / revenue : 0,
    evRevenue: price > 0 && revenue > 0 && enterprisePrice > 0 ? enterprisePrice / revenue : 0,
    evEbitda: price > 0 && ebitda > 0 && enterprisePrice > 0 ? enterprisePrice / ebitda : 0,
    evEbit: price > 0 && ebit > 0 && enterprisePrice > 0 ? enterprisePrice / ebit : 0,
    pFfo: price > 0 && ffo > 0 ? price / ffo : 0,
  };
  multipleCache.set(row, values);
  return values[kind];
}

function isEligiblePeer(row: ComparableRow, target: ComparableRow) {
  const targetBasis = String(target.dataBasis ?? "").trim();
  const peerBasis = String(row.dataBasis ?? "").trim();
  const basisMatches = !targetBasis || !peerBasis || targetBasis === peerBasis;
  const marketCap = numeric(row.marketCap);
  return normalize(row.ticker) !== normalize(target.ticker)
    && marketKey(row.market) === marketKey(target.market)
    && rowSector(row) === rowSector(target)
    && basisMatches
    // Avoid tiny rows distorting a broad sector benchmark. Taiwan ratio rows
    // generally have no market cap and therefore simply fall through.
    && (marketCap === 0 || marketCap >= 1_000_000_000);
}

function latestDate(rows: ComparableRow[]) {
  const dates = rows
    .map((row) => row.financialDataDate || row.date || "")
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1] || null;
}

function comparableMultiplesFromPeers(
  target: ComparableRow,
  peers: ComparableRow[],
  minPeers: number,
  peerGroup: string | null = null,
): ComparableMultiples | undefined {
  if (peers.length < minPeers) return undefined;
  const pe = trimmedMultiple(peers.map((row) => comparableMultiple(row, "pe")), MULTIPLE_CAPS.pe, minPeers);
  const ps = trimmedMultiple(peers.map((row) => comparableMultiple(row, "ps")), MULTIPLE_CAPS.ps, minPeers);
  const evRevenue = trimmedMultiple(peers.map((row) => comparableMultiple(row, "evRevenue")), MULTIPLE_CAPS.evRevenue, minPeers);
  const evEbitda = trimmedMultiple(peers.map((row) => comparableMultiple(row, "evEbitda")), MULTIPLE_CAPS.evEbitda, minPeers);
  const evEbit = trimmedMultiple(peers.map((row) => comparableMultiple(row, "evEbit")), MULTIPLE_CAPS.evEbit, minPeers);
  const pFfo = trimmedMultiple(peers.map((row) => comparableMultiple(row, "pFfo")), MULTIPLE_CAPS.pFfo, minPeers);
  return {
    sector: rowSector(target),
    peerGroup: peerGroup ?? undefined,
    market: marketKey(target.market),
    peerCount: peers.length,
    pePeerCount: pe.count,
    psPeerCount: ps.count,
    evRevenuePeerCount: evRevenue.count,
    evEbitdaPeerCount: evEbitda.count,
    evEbitPeerCount: evEbit.count,
    pFfoPeerCount: pFfo.count,
    peMedian: pe.value,
    psMedian: ps.value,
    evRevenueMedian: evRevenue.value,
    evEbitdaMedian: evEbitda.value,
    evEbitMedian: evEbit.value,
    pFfoMedian: pFfo.value,
    dataBasis: String(target.dataBasis || "mixed"),
    asOf: latestDate([target, ...peers]),
    method: peerGroup ? "business-group-trimmed-median" : "sector-trimmed-median",
  };
}

function mergeBusinessGroupWithSector(
  groupProfile: ComparableMultiples,
  sectorProfile: ComparableMultiples | undefined,
) {
  if (!sectorProfile) return groupProfile;
  const fallback = <T>(groupValue: T | null, sectorValue: T | null) => groupValue ?? sectorValue;
  const merged: ComparableMultiples = {
    ...groupProfile,
    psMedian: fallback(groupProfile.psMedian, sectorProfile.psMedian),
    evRevenueMedian: fallback(groupProfile.evRevenueMedian, sectorProfile.evRevenueMedian),
    evEbitdaMedian: fallback(groupProfile.evEbitdaMedian, sectorProfile.evEbitdaMedian),
    evEbitMedian: fallback(groupProfile.evEbitMedian, sectorProfile.evEbitMedian),
    pFfoMedian: fallback(groupProfile.pFfoMedian, sectorProfile.pFfoMedian),
    psPeerCount: groupProfile.psPeerCount || sectorProfile.psPeerCount,
    evRevenuePeerCount: groupProfile.evRevenuePeerCount || sectorProfile.evRevenuePeerCount,
    evEbitdaPeerCount: groupProfile.evEbitdaPeerCount || sectorProfile.evEbitdaPeerCount,
    evEbitPeerCount: groupProfile.evEbitPeerCount || sectorProfile.evEbitPeerCount,
    pFfoPeerCount: groupProfile.pFfoPeerCount || sectorProfile.pFfoPeerCount,
    method: "business-group-with-sector-fallback",
  };
  return merged;
}

export function comparableMultiplesForRow(
  target: ComparableRow,
  universe: ComparableRow[],
  minPeers = MIN_PEERS,
): ComparableMultiples | undefined {
  const targetGroup = rowPeerGroup(target);
  const groupRows = targetGroup
    ? universe.filter((row) => rowPeerGroup(row) === targetGroup)
    : [];
  const groupPeers = groupRows.filter((row) => isEligiblePeer(row, target));
  if (groupPeers.length >= Math.max(MIN_BUSINESS_GROUP_PEERS, minPeers - 1)) {
    const groupProfile = comparableMultiplesFromPeers(target, groupPeers, Math.max(MIN_BUSINESS_GROUP_PEERS, minPeers - 1), targetGroup);
    const sectorPeers = universe
      .filter((row) => rowSector(row) === rowSector(target))
      .filter((row) => isEligiblePeer(row, target));
    const sectorProfile = comparableMultiplesFromPeers(target, sectorPeers, minPeers);
    return groupProfile ? mergeBusinessGroupWithSector(groupProfile, sectorProfile) : sectorProfile;
  }
  const peers = universe
    .filter((row) => rowSector(row) === rowSector(target))
    .filter((row) => isEligiblePeer(row, target));
  return comparableMultiplesFromPeers(target, peers, minPeers);
}

export function buildComparableMap(
  universe: ComparableRow[],
  minPeers = MIN_PEERS,
) {
  const result = new Map<string, ComparableMultiples>();
  const groups = new Map<string, ComparableRow[]>();
  const sectors = new Map<string, ComparableRow[]>();
  for (const row of universe) {
    const peerGroup = rowPeerGroup(row);
    const key = `${marketKey(row.market)}|${peerGroup ? `group:${peerGroup}` : `sector:${rowSector(row)}`}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
    const sectorKeyValue = `${marketKey(row.market)}|sector:${rowSector(row)}`;
    const sectorRows = sectors.get(sectorKeyValue) ?? [];
    sectorRows.push(row);
    sectors.set(sectorKeyValue, sectorRows);
  }
  for (const target of universe) {
    const targetGroup = rowPeerGroup(target);
    const groupKey = `${marketKey(target.market)}|${targetGroup ? `group:${targetGroup}` : `sector:${rowSector(target)}`}`;
    const groupPeers = targetGroup
      ? (groups.get(groupKey) ?? []).filter((row) => isEligiblePeer(row, target))
      : [];
    const useGroup = groupPeers.length >= Math.max(MIN_BUSINESS_GROUP_PEERS, minPeers - 1);
    const sectorKeyValue = `${marketKey(target.market)}|sector:${rowSector(target)}`;
    const sectorRows = sectors.get(sectorKeyValue) ?? [];
    const peers = useGroup
      ? groupPeers
      : sectorRows.filter((row) => isEligiblePeer(row, target));
    const profile = comparableMultiplesFromPeers(target, peers, useGroup ? Math.max(MIN_BUSINESS_GROUP_PEERS, minPeers - 1) : minPeers, useGroup ? targetGroup : null);
    if (profile && useGroup) {
      const sectorPeers = sectorRows.filter((row) => isEligiblePeer(row, target));
      const sectorProfile = comparableMultiplesFromPeers(target, sectorPeers, minPeers);
      result.set(normalize(target.ticker), mergeBusinessGroupWithSector(profile, sectorProfile));
    } else if (profile) {
      result.set(normalize(target.ticker), profile);
    }
  }
  return result;
}
