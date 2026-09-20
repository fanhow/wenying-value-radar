/**
 * Research-only evidence contract and PE kernel. No fetches, supplier defaults,
 * forecasts, NI/share conversions, target fair values, or production imports.
 * Passing validation verifies the supplied contract, NOT a supplier's accuracy
 * or permission to redistribute it. Adapters must establish that provenance.
 */
export type EarningsInstrument = {
  ticker: string;
  exchange: 'TWSE' | 'TPEx';
  securityType: 'ordinary-share';
};

export type EarningsPeriod = {
  kind: 'annual' | 'ltm' | 'ntm';
  fiscalPeriodStart: string;
  fiscalPeriodEnd: string;
  providerPeriodKey: string;
  /** FY1/FY2 are relative to the reported annual period, not the current year. */
  relativeFiscalYear?: 1 | 2;
  anchorFiscalPeriodEnd?: string;
  anchorPublishedAt?: string;
  ntmMethod?: 'provider-time-weighted-annual' | 'provider-four-quarter';
};

export type EarningsBasis = {
  currency: 'TWD';
  accounting: 'reported' | 'adjusted' | 'unknown';
  dilution: 'basic' | 'diluted' | 'unknown';
  attribution: 'parent-ordinary-equity' | 'parent-all-equity' | 'including-nci' | 'unknown';
  operations: 'total' | 'continuing' | 'unknown';
  /** All per-share observations must be normalized to this explicit quote basis. */
  splitBasisDate: string;
  adjustmentMethod?: { id: string; methodologyUrl: string };
};

export type EarningsSource = {
  provider: string;
  url: string;
  field: string;
  kind: 'company-filing' | 'analyst-consensus' | 'market-quote';
  sourceAsOf: string;
  retrievedAt: string;
  /** Needed when evidence is retrieved after the valuation cutoff for replay. */
  pointInTime: boolean;
};

export type DirectEpsEvidence = {
  id: string;
  instrument: EarningsInstrument;
  metric: 'direct-eps';
  role: 'historical' | 'forward';
  value: number | null;
  unit: 'currency-per-ordinary-share';
  scale: 1;
  period: EarningsPeriod;
  basis: EarningsBasis;
  source: EarningsSource;
  consensus?: { statistic: 'mean' | 'median'; analystCount: number };
};

export type ObservedPeEvidence = {
  /** A market observation, never a target/model/fair-value multiple. */
  kind: 'observed-price-over-eps';
  instrument: EarningsInstrument;
  price: number;
  value: number;
  /** Optional source display precision; absent means an unrounded observation. */
  decimalPlaces?: number;
  source: EarningsSource;
  eps: DirectEpsEvidence;
};

export type PeResearchContext = {
  instrument: EarningsInstrument;
  valuationAsOf: string;
  evaluatedAt: string;
  mode: 'live' | 'point-in-time-replay';
  splitBasisDate: string;
  /** Explicit research policy, not supplier data or fitted parameters. */
  maxSourceAgeDays: { historical: number; forward: number };
  maxHistoricalPeriodAgeDays: number;
  minimumPeerCount: number;
};

export type PeBranchInput = {
  expectedPeriod: Pick<EarningsPeriod, 'kind' | 'fiscalPeriodStart' | 'fiscalPeriodEnd'>;
  eps?: DirectEpsEvidence | null;
  observedMultiples: ObservedPeEvidence[];
};

export type PeBranchResult = {
  status: 'applied';
  value: number;
  eps: DirectEpsEvidence;
  observedMultiple: number;
  peerTickers: string[];
  excludedPeers: { ticker: string; reasons: string[] }[];
} | { status: 'excluded'; reasons: string[] };

const DAY = 86400000;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const unique = (values: string[]) => [...new Set(values)];

function date(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function instant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value.replace(/(?<!\.\d{3})Z$/, '.000Z');
}

function sourceUrl(value: unknown) {
  if (!text(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && ![...url.searchParams.keys()].some(k => /token|api.?key|secret|password|authorization|crumb/i.test(k));
  } catch { return false; }
}

function instrument(value: EarningsInstrument | undefined) {
  return Boolean(value && typeof value.ticker === 'string' && /^\d{4,6}$/.test(value.ticker) && ['TWSE', 'TPEx'].includes(value.exchange)
    && value.securityType === 'ordinary-share');
}
const identity = (value: EarningsInstrument) => `${value.exchange}:${value.ticker}`;
const periodKey = (p: PeBranchInput['expectedPeriod']) => `${p.kind}|${p.fiscalPeriodStart}|${p.fiscalPeriodEnd}`;
const basisKey = (b: EarningsBasis) => JSON.stringify([b.currency, b.accounting, b.dilution,
  b.attribution, b.operations, b.splitBasisDate, b.adjustmentMethod?.id, b.adjustmentMethod?.methodologyUrl]);

function fullYear(p: PeBranchInput['expectedPeriod']) {
  if (!p || !date(p.fiscalPeriodStart) || !date(p.fiscalPeriodEnd)) return false;
  const start = new Date(p.fiscalPeriodStart);
  // This MVP accepts exactly 12 calendar months, not 52/53-week or stub periods.
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()) - DAY).toISOString().slice(0, 10);
  return end === p.fiscalPeriodEnd;
}

function contextIssues(c: PeResearchContext) {
  return !c || !instrument(c.instrument) || !instant(c.valuationAsOf) || !instant(c.evaluatedAt)
    || Date.parse(c.valuationAsOf) > Date.parse(c.evaluatedAt)
    || !['live', 'point-in-time-replay'].includes(c.mode)
    || !date(c.splitBasisDate) || c.splitBasisDate !== c.valuationAsOf.slice(0, 10)
    || !finite(c.maxSourceAgeDays?.historical) || c.maxSourceAgeDays.historical < 0
    || !finite(c.maxSourceAgeDays?.forward) || c.maxSourceAgeDays.forward < 0
    || !finite(c.maxHistoricalPeriodAgeDays) || c.maxHistoricalPeriodAgeDays < 0
    || !Number.isInteger(c.minimumPeerCount) || c.minimumPeerCount < 1 ? ['INVALID_CONTEXT'] : [];
}

function sourceIssues(s: EarningsSource | undefined, c: PeResearchContext, maxAgeDays: number) {
  if (!s || !text(s.provider) || !text(s.field) || !sourceUrl(s.url)
    || !instant(s.sourceAsOf) || !instant(s.retrievedAt) || typeof s.pointInTime !== 'boolean') return ['INVALID_SOURCE'];
  const asOf = Date.parse(s.sourceAsOf), retrieved = Date.parse(s.retrievedAt), cutoff = Date.parse(c.valuationAsOf);
  const issues = [];
  if (asOf > cutoff || asOf > retrieved || retrieved > Date.parse(c.evaluatedAt)) issues.push('NON_CAUSAL_SOURCE');
  if (retrieved > cutoff && (c.mode !== 'point-in-time-replay' || !s.pointInTime)) issues.push('POINT_IN_TIME_EVIDENCE_REQUIRED');
  if ((cutoff - asOf) / DAY > maxAgeDays) issues.push('STALE_SOURCE');
  return issues;
}

/** Losses and zero are valid evidence; PE positivity is checked separately. */
export function validateDirectEpsEvidence(e: DirectEpsEvidence | null | undefined,
  role: 'historical' | 'forward', c: PeResearchContext, expectedInstrument = c?.instrument): string[] {
  const invalidContext = contextIssues(c);
  if (invalidContext.length) return invalidContext;
  if (!e) return ['MISSING_EPS'];
  const issues: string[] = [];
  if (!text(e.id) || e.metric !== 'direct-eps' || e.unit !== 'currency-per-ordinary-share' || e.scale !== 1) issues.push('DIRECT_EPS_REQUIRED');
  if (e.role !== role) issues.push('EARNINGS_ROLE_MISMATCH');
  if (!instrument(e.instrument) || !instrument(expectedInstrument)
    || identity(e.instrument) !== identity(expectedInstrument)) issues.push('INSTRUMENT_MISMATCH');
  if (!finite(e.value)) issues.push('MISSING_OR_INVALID_EPS');
  const b = e.basis;
  if (!b || b.currency !== 'TWD' || !['reported', 'adjusted'].includes(b.accounting)
    || !['basic', 'diluted'].includes(b.dilution) || b.attribution !== 'parent-ordinary-equity'
    || !['total', 'continuing'].includes(b.operations)) issues.push('UNKNOWN_OR_UNSUPPORTED_EPS_BASIS');
  if (!b || b.splitBasisDate !== c.splitBasisDate) issues.push('SHARE_BASIS_MISMATCH');
  if (b?.accounting === 'adjusted' && (!text(b.adjustmentMethod?.id) || !sourceUrl(b.adjustmentMethod?.methodologyUrl))) issues.push('ADJUSTMENT_METHOD_REQUIRED');
  if (b?.accounting === 'reported' && b.adjustmentMethod != null) issues.push('CONTRADICTORY_ADJUSTMENT_BASIS');
  const sourceAsOf = instant(e.source?.sourceAsOf) ? e.source.sourceAsOf : null;
  const p = e.period;
  if (!p || !fullYear(p) || !text(p.providerPeriodKey) || !['annual', 'ltm', 'ntm'].includes(p.kind)) issues.push('INVALID_EARNINGS_PERIOD');
  else {
    if (role === 'historical' && (p.kind === 'ntm' || (sourceAsOf != null && p.fiscalPeriodEnd >= sourceAsOf.slice(0, 10)))) issues.push('UNREPORTED_HISTORICAL_PERIOD');
    if (role === 'historical' && (Date.parse(c.valuationAsOf) - Date.parse(p.fiscalPeriodEnd)) / DAY > c.maxHistoricalPeriodAgeDays) issues.push('STALE_HISTORICAL_PERIOD');
    if (role === 'forward' && p.kind === 'ltm') issues.push('FORWARD_PERIOD_REQUIRED');
    if (role === 'forward' && p.kind === 'annual' && p.fiscalPeriodEnd <= c.valuationAsOf.slice(0, 10)
      && p.relativeFiscalYear == null) issues.push('UNVERIFIED_UNREPORTED_PERIOD');
    // This MVP accepts an exact next-12-month window beginning on the quote day
    // or its following day; deferred years and fiscal-quarter approximations fail closed.
    const nextDate = new Date(Date.parse(c.valuationAsOf.slice(0, 10)) + DAY).toISOString().slice(0, 10);
    if (p.kind === 'ntm' && (!['provider-time-weighted-annual', 'provider-four-quarter'].includes(p.ntmMethod!)
      || ![c.valuationAsOf.slice(0, 10), nextDate].includes(p.fiscalPeriodStart)
      || p.fiscalPeriodEnd <= c.valuationAsOf.slice(0, 10)
      || p.relativeFiscalYear != null || p.anchorFiscalPeriodEnd != null || p.anchorPublishedAt != null)) issues.push('INVALID_NTM_PERIOD');
    if (p.kind !== 'ntm' && p.ntmMethod != null) issues.push('NTM_METHOD_ON_FISCAL_PERIOD');
    if (p.relativeFiscalYear != null) {
      if (role !== 'forward' || p.kind !== 'annual' || ![1, 2].includes(p.relativeFiscalYear)
        || !date(p.anchorFiscalPeriodEnd) || !instant(p.anchorPublishedAt)
        || p.anchorFiscalPeriodEnd.slice(5) !== p.fiscalPeriodEnd.slice(5)
        || Number(p.fiscalPeriodEnd.slice(0, 4)) !== Number(p.anchorFiscalPeriodEnd.slice(0, 4)) + p.relativeFiscalYear
        || p.anchorPublishedAt.slice(0, 10) <= p.anchorFiscalPeriodEnd
        || sourceAsOf == null || Date.parse(p.anchorPublishedAt) > Date.parse(sourceAsOf)) issues.push('UNVERIFIED_RELATIVE_FISCAL_PERIOD');
    } else if (p.anchorFiscalPeriodEnd != null || p.anchorPublishedAt != null) issues.push('ORPHAN_FISCAL_ANCHOR');
  }
  const requiredSourceKind = role === 'historical' ? 'company-filing' : 'analyst-consensus';
  if (e.source?.kind !== requiredSourceKind) issues.push('SOURCE_KIND_MISMATCH');
  issues.push(...sourceIssues(e.source, c, c.maxSourceAgeDays[role]));
  if (role === 'forward' && (!e.consensus || !['mean', 'median'].includes(e.consensus.statistic)
    || !Number.isInteger(e.consensus.analystCount) || e.consensus.analystCount < 1)) issues.push('CONSENSUS_METADATA_REQUIRED');
  return unique(issues);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
}

function signature(value: unknown): string {
  // Type-tag all nodes so nonfinite numbers cannot collapse to JSON null or
  // collide with a literal string/object marker supplied by malformed evidence.
  const stable = (item: unknown): unknown => item === null ? ['null']
    : Array.isArray(item) ? ['array', item.map(stable)]
      : typeof item === 'object' ? ['object', Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, stable(v)])]
        : [typeof item, Object.is(item, -0) ? '-0' : String(item)];
  return JSON.stringify(stable(value));
}

export function evaluatePeEvidenceBranch(input: PeBranchInput | null | undefined,
  role: 'historical' | 'forward', c: PeResearchContext): PeBranchResult {
  const reasons = validateDirectEpsEvidence(input?.eps, role, c);
  if (reasons.length || !input?.eps) return { status: 'excluded', reasons };
  const eps = input.eps;
  if (!fullYear(input.expectedPeriod) || periodKey(eps.period) !== periodKey(input.expectedPeriod)) return { status: 'excluded', reasons: ['REQUESTED_PERIOD_MISMATCH'] };
  if (!positive(eps.value)) return { status: 'excluded', reasons: ['NON_POSITIVE_EPS'] };
  if (!Array.isArray(input.observedMultiples)) return { status: 'excluded', reasons: ['OBSERVED_MULTIPLES_REQUIRED'] };
  const excludedPeers: { ticker: string; reasons: string[] }[] = [];
  const candidates = new Map<string, ObservedPeEvidence>(), conflicts = new Set<string>();
  for (const row of input.observedMultiples) {
    if (!row || !instrument(row.instrument)) { excludedPeers.push({ ticker: '', reasons: ['INVALID_PEER'] }); continue; }
    const key = identity(row.instrument), previous = candidates.get(key);
    if (previous && signature(previous) !== signature(row)) conflicts.add(key);
    else candidates.set(key, row);
  }
  const accepted: { ticker: string; ratio: number }[] = [];
  for (const [key, row] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
    if (conflicts.has(key)) {
      excludedPeers.push({ ticker: row.instrument.ticker, reasons: ['CONFLICTING_PEER_OBSERVATIONS'] });
      continue;
    }
    const failures = validateDirectEpsEvidence(row.eps, role, c, row.instrument);
    if (key === identity(c.instrument)) failures.push('SELF_COMPARABLE');
    if (row.kind !== 'observed-price-over-eps') failures.push('OBSERVED_MULTIPLE_REQUIRED');
    if (row.source?.kind !== 'market-quote' || !instant(row.source?.sourceAsOf)
      || Date.parse(row.source.sourceAsOf) !== Date.parse(c.valuationAsOf)) failures.push('QUOTE_SESSION_MISMATCH');
    failures.push(...sourceIssues(row.source, c, 0));
    if (!positive(row.price) || !positive(row.value) || !positive(row.eps?.value)) failures.push('INVALID_OBSERVED_MULTIPLE');
    if (row.eps?.period && (periodKey(row.eps.period) !== periodKey(eps.period)
      || row.eps.period.ntmMethod !== eps.period.ntmMethod)) failures.push('PEER_PERIOD_MISMATCH');
    if (row.eps?.basis && basisKey(row.eps.basis) !== basisKey(eps.basis)) failures.push('PEER_EPS_BASIS_MISMATCH');
    if (role === 'forward' && row.eps?.consensus?.statistic !== eps.consensus?.statistic) failures.push('PEER_CONSENSUS_STATISTIC_MISMATCH');
    const digits = row.decimalPlaces;
    if (digits != null && (!Number.isInteger(digits) || digits < 0 || digits > 8)) failures.push('INVALID_MULTIPLE_PRECISION');
    const ratio = positive(row.eps?.value) ? row.price / row.eps.value : Number.NaN;
    const expected = digits == null ? ratio : Number(ratio.toFixed(Number.isInteger(digits) && digits >= 0 && digits <= 8 ? digits : 8));
    if (!Number.isFinite(expected) || Math.abs(expected - row.value) > Math.max(1, Math.abs(expected)) * 1e-10) failures.push('OBSERVED_MULTIPLE_RECONCILIATION_FAILED');
    if (failures.length) excludedPeers.push({ ticker: row.instrument.ticker, reasons: unique(failures) });
    else accepted.push({ ticker: row.instrument.ticker, ratio: row.value });
  }
  if (accepted.length < c.minimumPeerCount) return { status: 'excluded', reasons: unique(['INSUFFICIENT_VALID_OBSERVED_MULTIPLES', ...excludedPeers.flatMap(p => p.reasons)]) };
  const observedMultiple = median(accepted.map(p => p.ratio)), value = eps.value * observedMultiple;
  if (!positive(value)) return { status: 'excluded', reasons: ['NON_FINITE_MODEL_VALUE'] };
  return { status: 'applied', value, eps, observedMultiple, peerTickers: accepted.map(p => p.ticker), excludedPeers };
}

/** No single-branch fallback is mislabeled as a two-branch arithmetic mean. */
export function researchHistoricalForwardPe(input: {
  historical?: PeBranchInput | null; forward?: PeBranchInput | null;
}, c: PeResearchContext) {
  const historical = evaluatePeEvidenceBranch(input?.historical, 'historical', c);
  const forward = evaluatePeEvidenceBranch(input?.forward, 'forward', c);
  let combined: { status: 'applied'; value: number; method: 'equal-mean-two-verified-branches' }
    | { status: 'excluded'; reasons: string[] };
  if (historical.status !== 'applied' || forward.status !== 'applied') combined = { status: 'excluded', reasons: ['TWO_VALID_BRANCHES_REQUIRED'] };
  else if (basisKey(historical.eps.basis) !== basisKey(forward.eps.basis)) combined = { status: 'excluded', reasons: ['CROSS_BRANCH_EPS_BASIS_MISMATCH'] };
  else if (forward.eps.period.fiscalPeriodEnd <= historical.eps.period.fiscalPeriodEnd) combined = { status: 'excluded', reasons: ['FORWARD_PERIOD_NOT_AFTER_HISTORY'] };
  else if (input.historical!.observedMultiples.some(h => h && instrument(h.instrument) && historical.peerTickers.includes(h.instrument.ticker)
    && input.forward!.observedMultiples.some(f => f && instrument(f.instrument) && forward.peerTickers.includes(f.instrument.ticker)
      && identity(h.instrument) === identity(f.instrument) && h.price !== f.price))) combined = { status: 'excluded', reasons: ['CROSS_BRANCH_PEER_PRICE_CONFLICT'] };
  else combined = { status: 'applied', value: historical.value / 2 + forward.value / 2, method: 'equal-mean-two-verified-branches' };
  return { historical, forward, combined };
}
