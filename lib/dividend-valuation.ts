/** Source distinctions for DDM research. No rates or dividend growth are inferred. */
export type DividendShareBasis = "ordinary-per-share" | "ending-ordinary"
  | "weighted-average-basic" | "weighted-average-diluted" | "unknown";
export type DividendEvidence = {
  kind: "declared" | "paid" | "earnings-adjusted" | "unknown";
  currency: string;
  periodBasis: "annual" | "ltm" | "unknown";
  periodStart?: string;
  periodEnd?: string;
  shareBasis: DividendShareBasis;
  ordinaryScope: "ordinary-only" | "includes-special" | "unknown";
  /** Payment/forecast timing is separate from the income/declaration period. */
  paymentTiming?: "historical" | "forward" | "unknown";
  source: string;
  sourceFacts?: Array<{ start?: string; end: string; accn?: string }>;
  shareSource?: string;
  shareAsOfDate?: string;
};
export type DividendEarningsEvidence = {
  valuePerShare: number;
  currency: string;
  periodBasis: "annual" | "ltm" | "unknown";
  periodStart?: string;
  periodEnd?: string;
  shareBasis: DividendShareBasis;
  basis: "reported-common" | "normalized-common";
  source: string;
};
export type DdmResearchAssumptions = {
  growthRateAnnualDecimal: number;
  costOfEquityAnnualDecimal: number;
  growthSource: string;
  costOfEquitySource: string;
  dividendTiming: "D0" | "D1";
  timingSource: string;
  sustainabilitySource: string;
};
export type DividendResearchIssue = {
  code: string;
  category: "source-data" | "period-basis" | "assumption";
  reason: string;
};
export type DividendResearchAssessment = {
  status: "inputs-unavailable" | "basis-review" | "zero-dividend"
    | "assumptions-unavailable" | "assumptions-invalid" | "research-ready";
  dividendPerShare: number | null;
  currency: string | null;
  payoutRatio: number | null;
  matchedEarningsPerShare: number | null;
  fairValue: number | null;
  growthRateAnnual: number | null;
  costOfEquityAnnual: number | null;
  issues: DividendResearchIssue[];
  includedInFormalValuation: false;
};

/** Preserve an explicit zero or invalid negative observation; missing is never zero. */
export function dividendAmount(value: unknown): number | undefined {
  if (value === undefined || value === null || typeof value === "boolean"
    || (typeof value === "string" && value.trim() === "")
    || (typeof value !== "number" && typeof value !== "string")) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const hasSource = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
function calendarDate(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date : null;
}
function annualPeriod(evidence: Pick<DividendEvidence, "periodBasis" | "periodStart" | "periodEnd">) {
  const start = calendarDate(evidence.periodStart), end = calendarDate(evidence.periodEnd);
  if (start === null || end === null || !["annual", "ltm"].includes(evidence.periodBasis)) return false;
  const days = (end - start) / 86_400_000 + 1;
  // Supports 52/53-week fiscal years, but never silently annualizes a quarter/YTD.
  return days >= 350 && days <= 380;
}

export function evaluateDividendResearch(input: {
  dividendPerShare?: number;
  dividendEvidence?: DividendEvidence;
  dividendEarnings?: DividendEarningsEvidence;
  ddmResearchAssumptions?: DdmResearchAssumptions;
}): DividendResearchAssessment {
  const observed = dividendAmount(input.dividendPerShare);
  const result: DividendResearchAssessment = {
    status: "inputs-unavailable", dividendPerShare: observed ?? null,
    currency: hasSource(input.dividendEvidence?.currency) ? input.dividendEvidence!.currency : null,
    payoutRatio: null, matchedEarningsPerShare: null, fairValue: null,
    growthRateAnnual: null, costOfEquityAnnual: null, issues: [],
    includedInFormalValuation: false,
  };
  const stop = (status: DividendResearchAssessment["status"], code: string,
    category: DividendResearchIssue["category"], reason: string) => {
    result.status = status;
    result.issues.push({ code, category, reason });
    return result;
  };
  if (observed === undefined) return stop("inputs-unavailable", "DIVIDEND_AMOUNT_UNAVAILABLE", "source-data",
    "尚未取得股利數值；缺值不代表零配息。");
  if (observed < 0) return stop("basis-review", "INVALID_DIVIDEND_AMOUNT", "period-basis",
    "每股股利為負值，需核對金額符號與來源，未以零替代。");
  const dividend = input.dividendEvidence;
  if (!dividend || !hasSource(dividend.source) || dividend.kind === "unknown") {
    return stop("inputs-unavailable", "DIVIDEND_SOURCE_BASIS_UNAVAILABLE", "source-data",
      "股利尚未區分決議、實付或調整後口徑，不能直接作為穩定配息。");
  }
  if (dividend.kind === "earnings-adjusted") return stop("basis-review", "ADJUSTED_DIVIDEND_SEPARATE_SCENARIO", "period-basis",
    "盈餘與留存率衍生股利屬獨立假設情境，不能替代已決議或實付股利。");
  if (dividend.kind !== "declared" && dividend.kind !== "paid") return stop("basis-review", "INVALID_DIVIDEND_KIND", "period-basis",
    "股利種類尚未取得可辨識來源。");
  if (!annualPeriod(dividend) || !hasSource(dividend.currency)) return stop("basis-review", "DIVIDEND_ANNUAL_PERIOD_UNVERIFIED", "period-basis",
    "缺少完整年度／LTM 股利期間與幣別；單季或決議年度不自動轉為年化實付股利。");
  if (dividend.ordinaryScope !== "ordinary-only") return stop("basis-review", "ORDINARY_DIVIDEND_SCOPE_UNVERIFIED", "source-data",
    "普通與特別股利尚未分開，不能假設全部金額可永久持續。");
  if (observed === 0) return stop("zero-dividend", "OBSERVED_ZERO_DIVIDEND", "assumption",
    "來源記載該期間普通股利為零；保留觀測零值，不由另一股利種類補值。");
  const earnings = input.dividendEarnings;
  if (!earnings || !hasSource(earnings.source)) return stop("inputs-unavailable", "MATCHED_DIVIDEND_EARNINGS_UNAVAILABLE", "source-data",
    "缺少與股利配對的普通股盈餘；不以模型正常化 EPS 自動作配息率分母。");
  if (earnings.basis !== "reported-common" || !annualPeriod(earnings)
    || earnings.currency !== dividend.currency || earnings.periodBasis !== dividend.periodBasis
    || earnings.periodStart !== dividend.periodStart || earnings.periodEnd !== dividend.periodEnd
    || !["ordinary-per-share", "ending-ordinary", "weighted-average-basic", "weighted-average-diluted"].includes(dividend.shareBasis)
    || earnings.shareBasis !== dividend.shareBasis) {
    return stop("basis-review", "DIVIDEND_EARNINGS_BASIS_MISMATCH", "period-basis",
      "股利與盈餘的期間、普通股每股基礎或正常化口徑不一致，配息率暫不計算。");
  }
  if (!Number.isFinite(earnings.valuePerShare) || earnings.valuePerShare <= 0) {
    return stop("basis-review", "MATCHED_EARNINGS_NOT_POSITIVE", "assumption",
      "同期間普通股盈餘非正數，無法建立可解讀的盈餘配息率。");
  }
  const payout = observed / earnings.valuePerShare;
  if (!Number.isFinite(payout)) return stop("basis-review", "NON_FINITE_DIVIDEND_PAYOUT", "period-basis",
    "配息率計算超出可表示範圍，需核对每股單位。");
  result.payoutRatio = payout;
  result.matchedEarningsPerShare = earnings.valuePerShare;
  const assumptions = input.ddmResearchAssumptions;
  if (!assumptions || !hasSource(assumptions.growthSource) || !hasSource(assumptions.costOfEquitySource)
    || !hasSource(assumptions.timingSource) || !hasSource(assumptions.sustainabilitySource)) {
    return stop("assumptions-unavailable", "DDM_ASSUMPTIONS_UNAVAILABLE", "source-data",
      "尚缺可追溯的股利成長、股權成本、D0／D1 時點與持續配息依據；不由營收成長或 CAPM 預設補齊。");
  }
  if ((assumptions.dividendTiming === "D0" && dividend.paymentTiming !== "historical")
    || (assumptions.dividendTiming === "D1"
      && (dividend.kind !== "declared" || dividend.paymentTiming !== "forward"))) {
    return stop("basis-review", "DIVIDEND_FORWARD_TIMING_MISMATCH", "period-basis",
      "股利支付／前瞻時點未與 D0／D1 配對；已支付股利不能改標為下一期股利。");
  }
  const g = assumptions.growthRateAnnualDecimal, ke = assumptions.costOfEquityAnnualDecimal;
  if (![g, ke].every(Number.isFinite) || g <= -1 || g >= 1 || ke <= 0 || ke >= 1 || ke <= g
    || !["D0", "D1"].includes(assumptions.dividendTiming)) {
    return stop("assumptions-invalid", "DDM_RATE_OR_TIMING_INVALID", "assumption",
      "研究參數須以年化小數明示且股權成本大於股利成長率；未裁切或替換無效參數。");
  }
  const nextDividend = assumptions.dividendTiming === "D0" ? observed * (1 + g) : observed;
  const fairValue = nextDividend / (ke - g);
  if (!Number.isFinite(fairValue)) return stop("assumptions-invalid", "NON_FINITE_DDM_RESEARCH_VALUE", "assumption",
    "股利研究算式超出可表示範圍，保留空值。");
  result.status = "research-ready";
  result.growthRateAnnual = g;
  result.costOfEquityAnnual = ke;
  result.fairValue = fairValue;
  return result;
}
