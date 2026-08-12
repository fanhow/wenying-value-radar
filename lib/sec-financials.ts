export type SecFact = {
  val: number;
  start?: string;
  end?: string;
  filed?: string;
  form?: string;
  frame?: string;
  accn?: string;
  fy?: number;
  fp?: string;
};

export type SecCompanyFacts = {
  entityName?: string;
  facts?: Record<string, Record<string, { units?: Record<string, SecFact[]> }>>;
};

export type FinancialMetric = {
  value: number;
  start?: string;
  end?: string;
  basis: "ltm" | "annual" | "latest";
  sourceFacts: SecFact[];
};

export type FinancialGrowth = {
  rate: number;
  currentValue: number;
  priorValue: number;
  end?: string;
  basis: "ltm" | "annual";
};

export type HistoricalMetricPoint = {
  value: number;
  start?: string;
  end?: string;
  filed?: string;
  basis: "annual";
};

export type ConceptMetric = {
  facts: SecFact[];
  metric: FinancialMetric;
};

type MetricPeriod = Pick<FinancialMetric, "basis" | "end">;

type DebtValues = {
  total?: number | null;
  current?: number | null;
  noncurrent?: number | null;
};

const ANNUAL_FORMS = new Set(["10-K", "20-F", "40-F"]);
const QUARTERLY_FORMS = new Set(["10-Q", "6-K"]);

function timestamp(value?: string) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function factKey(fact: SecFact) {
  return `${fact.start ?? ""}|${fact.end ?? ""}|${fact.form ?? ""}|${fact.frame ?? ""}`;
}

function sortNewest(left: SecFact, right: SecFact) {
  return `${right.end ?? ""}${right.filed ?? ""}`.localeCompare(`${left.end ?? ""}${left.filed ?? ""}`);
}

function dedupeFacts(facts: SecFact[]) {
  const latest = new Map<string, SecFact>();
  for (const fact of facts) {
    const key = factKey(fact);
    const current = latest.get(key);
    if (!current || `${fact.filed ?? ""}${fact.accn ?? ""}` > `${current.filed ?? ""}${current.accn ?? ""}`) {
      latest.set(key, fact);
    }
  }
  return [...latest.values()].sort(sortNewest);
}

export function durationDays(fact: SecFact) {
  const start = timestamp(fact.start);
  const end = timestamp(fact.end);
  return start && end && end >= start ? Math.round((end - start) / 86_400_000) : 0;
}

export function selectSecFacts(
  companyFacts: SecCompanyFacts,
  taxonomy: string,
  conceptNames: string[],
  acceptedUnits: string[],
) {
  const taxonomyFacts = companyFacts.facts?.[taxonomy] ?? {};
  for (const conceptName of conceptNames) {
    const units = taxonomyFacts[conceptName]?.units ?? {};
    const facts = acceptedUnits.flatMap((unit) => units[unit] ?? []);
    const valid = facts.filter((fact) => Number.isFinite(fact.val) && fact.end);
    if (valid.length) return dedupeFacts(valid);
  }
  return [];
}

export function latestAnnualMetric(facts: SecFact[]): FinancialMetric | null {
  const annual = facts
    .filter((fact) => ANNUAL_FORMS.has(fact.form ?? "") && (durationDays(fact) >= 300 || /^CY\d{4}$/.test(fact.frame ?? "")))
    .sort(sortNewest)[0];
  if (!annual) return null;
  return {
    value: annual.val,
    start: annual.start,
    end: annual.end,
    basis: "annual",
    sourceFacts: [annual],
  };
}

/**
 * Return distinct, complete-year observations for a duration fact.
 *
 * The valuation engine uses this only as a historical normalization input;
 * it is deliberately not a forward estimate.  Facts are deduplicated by
 * period end and the latest filing is retained for each period.
 */
export function annualMetricHistory(facts: SecFact[], limit = 5): HistoricalMetricPoint[] {
  if (limit < 1) return [];
  const annual = dedupeFacts(facts)
    .filter((fact) => (
      ANNUAL_FORMS.has(fact.form ?? "")
      && (durationDays(fact) >= 300 || /^CY\d{4}$/.test(fact.frame ?? ""))
      && Number.isFinite(fact.val)
      && Boolean(fact.end)
    ))
    .sort((left, right) => timestamp(right.end) - timestamp(left.end) || sortNewest(left, right));
  const seenEnds = new Set<string>();
  const history: HistoricalMetricPoint[] = [];
  for (const fact of annual) {
    const end = fact.end ?? "";
    if (!end || seenEnds.has(end)) continue;
    seenEnds.add(end);
    history.push({
      value: fact.val,
      start: fact.start,
      end: fact.end,
      filed: fact.filed,
      basis: "annual",
    });
    if (history.length >= limit) break;
  }
  return history;
}

export function latestInstantMetric(facts: SecFact[]): FinancialMetric | null {
  const latest = [...facts]
    .filter((fact) => !fact.start || durationDays(fact) <= 1)
    .sort(sortNewest)[0];
  if (!latest) return null;
  return {
    value: latest.val,
    start: latest.start,
    end: latest.end,
    basis: "latest",
    sourceFacts: [latest],
  };
}

export function metricsAlign(...metrics: Array<MetricPeriod | null | undefined>) {
  if (metrics.length === 0 || metrics.some((metric) => !metric)) return false;
  const [first] = metrics as MetricPeriod[];
  if (!first.end) return false;
  return (metrics as MetricPeriod[]).every(
    (metric) => metric.basis === first.basis && metric.end === first.end,
  );
}

export function summarizeFinancialBasis(metrics: Array<MetricPeriod | null | undefined>) {
  const available = metrics.filter((metric): metric is MetricPeriod => Boolean(metric));
  const end = available
    .map((metric) => metric.end ?? "")
    .filter(Boolean)
    .sort()
    .at(-1);
  const aligned = metricsAlign(...available);
  const basis = aligned && available[0]?.basis === "ltm"
    ? "ltm" as const
    : aligned && available[0]?.basis === "annual"
      ? "annual" as const
      : "estimated" as const;
  return { basis, end, aligned };
}

export function aggregateDebtValues({ total, current, noncurrent }: DebtValues) {
  const valid = (value: number | null | undefined) => (
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
  );
  const totalValue = valid(total);
  if (totalValue !== null) return totalValue;
  const components = [valid(current), valid(noncurrent)]
    .filter((value): value is number => value !== null);
  return components.length > 0
    ? components.reduce((sum, value) => sum + value, 0)
    : null;
}

function closestPriorPeriod(current: SecFact, candidates: SecFact[]) {
  const currentEnd = timestamp(current.end);
  const currentDuration = durationDays(current);
  return candidates
    .filter((fact) => {
      const dayGap = Math.abs((currentEnd - timestamp(fact.end)) / 86_400_000 - 365);
      const durationGap = Math.abs(durationDays(fact) - currentDuration);
      return dayGap <= 45 && durationGap <= 35;
    })
    .sort((left, right) => {
      const leftGap = Math.abs((currentEnd - timestamp(left.end)) / 86_400_000 - 365);
      const rightGap = Math.abs((currentEnd - timestamp(right.end)) / 86_400_000 - 365);
      return leftGap - rightGap || sortNewest(left, right);
    })[0];
}

function areConsecutiveQuarters(quarters: SecFact[]) {
  if (quarters.length !== 4) return false;
  const chronological = [...quarters].sort(
    (left, right) => timestamp(left.start) - timestamp(right.start),
  );
  if (chronological.some((fact) => !timestamp(fact.start) || !timestamp(fact.end))) return false;
  for (let index = 1; index < chronological.length; index += 1) {
    const priorEnd = timestamp(chronological[index - 1].end);
    const currentStart = timestamp(chronological[index].start);
    const gapDays = (currentStart - priorEnd) / 86_400_000;
    if (gapDays < 1 || gapDays > 7) return false;
  }
  const coveredDays = (
    timestamp(chronological.at(-1)?.end) - timestamp(chronological[0].start)
  ) / 86_400_000;
  return coveredDays >= 300 && coveredDays <= 400;
}

export function trailingTwelveMonthsMetric(facts: SecFact[]): FinancialMetric | null {
  const annual = latestAnnualMetric(facts);
  if (!annual) return null;
  const annualFact = annual.sourceFacts[0];
  const annualEnd = timestamp(annual.end);

  const ytdFacts = facts
    .filter((fact) => QUARTERLY_FORMS.has(fact.form ?? ""))
    .filter((fact) => durationDays(fact) >= 150 && durationDays(fact) <= 310)
    .filter((fact) => timestamp(fact.end) > annualEnd)
    .sort(sortNewest);
  const currentYtd = ytdFacts[0];
  if (currentYtd) {
    const priorYtd = closestPriorPeriod(
      currentYtd,
      facts.filter((fact) => QUARTERLY_FORMS.has(fact.form ?? "") && fact !== currentYtd),
    );
    if (priorYtd) {
      const value = annualFact.val + currentYtd.val - priorYtd.val;
      if (Number.isFinite(value)) {
        return {
          value,
          start: annualFact.start,
          end: currentYtd.end,
          basis: "ltm",
          sourceFacts: [annualFact, currentYtd, priorYtd],
        };
      }
    }
  }

  const quarters = dedupeFacts(
    facts
      .filter((fact) => QUARTERLY_FORMS.has(fact.form ?? ""))
      .filter((fact) => durationDays(fact) >= 60 && durationDays(fact) <= 120),
  ).filter((fact, index, all) => all.findIndex((item) => item.end === fact.end) === index);
  if (quarters.length >= 4 && timestamp(quarters[0].end) > annualEnd) {
    const latestFour = quarters.slice(0, 4);
    const value = latestFour.reduce((sum, fact) => sum + fact.val, 0);
    if (areConsecutiveQuarters(latestFour) && Number.isFinite(value)) {
      return {
        value,
        start: latestFour.at(-1)?.start,
        end: latestFour[0].end,
        basis: "ltm",
        sourceFacts: latestFour,
      };
    }
  }

  return annual;
}

export function trailingTwelveMonthsGrowth(facts: SecFact[]): FinancialGrowth | null {
  const current = trailingTwelveMonthsMetric(facts);
  if (!current) return null;
  const annualFacts = dedupeFacts(
    facts.filter((fact) => ANNUAL_FORMS.has(fact.form ?? "") && durationDays(fact) >= 300),
  ).filter((fact, index, all) => all.findIndex((item) => item.end === fact.end) === index);

  if (current.basis === "ltm" && current.sourceFacts.length === 3) {
    const [latestAnnual, currentYtd, priorYtd] = current.sourceFacts;
    const priorAnnual = annualFacts.find((fact) => timestamp(fact.end) < timestamp(latestAnnual.end));
    const priorPriorYtd = closestPriorPeriod(
      priorYtd,
      facts.filter((fact) => QUARTERLY_FORMS.has(fact.form ?? "") && fact !== currentYtd && fact !== priorYtd),
    );
    if (priorAnnual && priorPriorYtd) {
      const priorValue = priorAnnual.val + priorYtd.val - priorPriorYtd.val;
      if (Number.isFinite(priorValue) && priorValue !== 0) {
        return {
          rate: (current.value - priorValue) / Math.abs(priorValue),
          currentValue: current.value,
          priorValue,
          end: current.end,
          basis: "ltm",
        };
      }
    }
  }

  if (annualFacts.length >= 2 && annualFacts[1].val !== 0) {
    return {
      rate: (annualFacts[0].val - annualFacts[1].val) / Math.abs(annualFacts[1].val),
      currentValue: annualFacts[0].val,
      priorValue: annualFacts[1].val,
      end: annualFacts[0].end,
      basis: "annual",
    };
  }
  return null;
}

export function metricFactsFromConcepts(
  companyFacts: SecCompanyFacts,
  taxonomy: string,
  conceptNames: string[],
  acceptedUnits: string[],
  mode: "duration" | "instant",
) {
  const candidates: ConceptMetric[] = conceptNames.flatMap((conceptName) => {
    const facts = selectSecFacts(companyFacts, taxonomy, [conceptName], acceptedUnits);
    const metric = mode === "instant" ? latestInstantMetric(facts) : trailingTwelveMonthsMetric(facts);
    return metric ? [{ facts, metric }] : [];
  });
  if (!candidates.length) return null;

  // A concept list often contains legacy and newer SEC concepts for the same
  // metric.  Do not let the first (possibly stale) concept hide a newer value.
  // Prefer the most recent period, then the stronger period basis when dates tie.
  const basisRank = (basis: FinancialMetric["basis"]) =>
    basis === "ltm" ? 3 : basis === "annual" ? 2 : 1;
  return candidates.sort(
    (left, right) =>
      timestamp(right.metric.end) - timestamp(left.metric.end) ||
      basisRank(right.metric.basis) - basisRank(left.metric.basis),
  )[0];
}

export function metricFromConcepts(
  companyFacts: SecCompanyFacts,
  taxonomy: string,
  conceptNames: string[],
  acceptedUnits: string[],
  mode: "duration" | "instant",
) {
  return metricFactsFromConcepts(companyFacts, taxonomy, conceptNames, acceptedUnits, mode)?.metric ?? null;
}
