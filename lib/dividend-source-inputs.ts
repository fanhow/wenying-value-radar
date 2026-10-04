import {
  dividendAmount,
  type DividendEvidence,
  type DividendEarningsEvidence,
} from "./dividend-valuation.ts";
import {
  metricFactsFromConcepts,
  type ConceptMetric,
  type FinancialMetric,
  type SecCompanyFacts,
} from "./sec-financials.ts";

/** The annual+YTD-priorYTD bridge starts after the removed prior YTD. */
export function effectiveDividendPeriod(metric: FinancialMetric) {
  let periodStart = metric.start;
  if (metric.basis === "ltm" && metric.sourceFacts.length === 3) {
    const [annual, currentYtd, priorYtd] = metric.sourceFacts;
    const nextDay = (date?: string) => {
      const timestamp = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date) : Number.NaN;
      return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date
        ? new Date(timestamp + 86_400_000).toISOString().slice(0, 10)
        : undefined;
    };
    const priorYtdFollowsAnnual = Boolean(annual?.start && annual?.end && priorYtd?.start
      && priorYtd?.end && priorYtd.start === annual.start && priorYtd.end <= annual.end);
    const currentYtdFollowsAnnual = Boolean(currentYtd?.start && currentYtd.start === nextDay(annual?.end));
    periodStart = priorYtdFollowsAnnual && currentYtdFollowsAnnual ? nextDay(priorYtd?.end) : undefined;
  }
  return {
    periodBasis: metric.basis === "latest" ? "unknown" as const : metric.basis,
    periodStart,
    periodEnd: metric.end,
  };
}

/** Snapshot fields alone do not identify declaration/payment or ordinary/special scope. */
export function unclassifiedDividendInputs(value: unknown, currency: string, source: string) {
  return {
    dividendPerShare: dividendAmount(value),
    dividendEvidence: {
      kind: "unknown",
      currency,
      periodBasis: "unknown",
      shareBasis: "unknown",
      ordinaryScope: "unknown",
      paymentTiming: "unknown",
      source,
    } satisfies DividendEvidence,
  };
}

export function secDividendInputs({
  companyFacts,
  taxonomy,
  currency,
  epsCandidate,
  sharesCandidate,
}: {
  companyFacts: SecCompanyFacts;
  taxonomy: string;
  currency: string;
  epsCandidate?: ConceptMetric | null;
  sharesCandidate?: ConceptMetric | null;
}) {
  const direct = metricFactsFromConcepts(
    companyFacts,
    taxonomy,
    taxonomy === "us-gaap"
      ? ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"]
      : ["DividendsPaidPerShare"],
    [`${currency}/shares`, `${currency} / shares`],
    "duration",
  );
  const paid = direct ? null : metricFactsFromConcepts(
    companyFacts,
    taxonomy,
    taxonomy === "us-gaap" ? ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"] : ["DividendsPaid"],
    [currency],
    "duration",
  );
  const selected = direct ?? paid;
  const selectedPeriod = selected ? effectiveDividendPeriod(selected.metric) : undefined;
  const invalidBridge = selected?.metric.basis === "ltm" && selected.metric.sourceFacts.length === 3
    && !selectedPeriod?.periodStart;
  const shares = sharesCandidate?.metric;
  const sharesValue = dividendAmount(shares?.value);
  const paidValue = dividendAmount(paid?.metric.value);
  const sharesAligned = Boolean(shares?.end && shares.end === paid?.metric.end);
  // An explicit zero or an invalid negative direct DPS is still that observation.
  // It must never be replaced with a cash-flow concept via a truthiness fallback.
  const dividendPerShare = invalidBridge ? undefined : direct
    ? dividendAmount(direct.metric.value)
    : paid?.conceptName === "PaymentsOfDividendsCommonStock"
      && paidValue !== undefined && sharesValue !== undefined && sharesValue > 0 && sharesAligned
      ? paidValue / sharesValue
      : undefined;
  const sourceFor = (candidate: ConceptMetric) => `SEC ${candidate.taxonomy}:${candidate.conceptName}`;
  const shareBasis: DividendEvidence["shareBasis"] = direct
    ? "ordinary-per-share"
    : paid?.conceptName !== "PaymentsOfDividendsCommonStock"
      ? "unknown"
      : sharesCandidate?.conceptName === "EntityCommonStockSharesOutstanding"
        ? "ending-ordinary"
        : sharesCandidate?.conceptName === "WeightedAverageNumberOfDilutedSharesOutstanding"
          ? "weighted-average-diluted"
          : "unknown";
  const dividendEvidence: DividendEvidence | undefined = selected ? {
    kind: selected.conceptName.endsWith("Declared") ? "declared" : "paid",
    paymentTiming: selected.conceptName.endsWith("Declared") ? "unknown" : "historical",
    currency,
    ...selectedPeriod!,
    shareBasis,
    ordinaryScope: "unknown",
    source: sourceFor(selected),
    sourceFacts: selected.metric.sourceFacts.flatMap((fact) => fact.end
      ? [{ start: fact.start, end: fact.end, accn: fact.accn }]
      : []),
    ...(!direct && sharesCandidate ? {
      shareSource: sourceFor(sharesCandidate),
      shareAsOfDate: shares?.end,
    } : {}),
  } : undefined;
  const epsValue = dividendAmount(epsCandidate?.metric.value);
  const dividendEarnings: DividendEarningsEvidence | undefined = epsCandidate && epsValue !== undefined
    && epsCandidate.metric.basis !== "latest" ? {
    valuePerShare: epsValue,
    currency,
    ...effectiveDividendPeriod(epsCandidate.metric),
    periodBasis: epsCandidate.metric.basis,
    shareBasis: epsCandidate.conceptName === "EarningsPerShareBasic"
      ? "weighted-average-basic"
      : epsCandidate.conceptName === "EarningsPerShareDiluted"
        ? "weighted-average-diluted"
        : "unknown",
    basis: "reported-common",
    source: sourceFor(epsCandidate),
  } : undefined;
  return {
    dividendPerShare,
    dividendEvidence,
    dividendEarnings,
    dividendBasisMetric: selected?.metric ?? null,
  };
}
