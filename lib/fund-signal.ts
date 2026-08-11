export type InstitutionalChangeType = "new" | "increased" | "reduced" | "unchanged";

export type InstitutionalHoldingSignal = {
  fundName: string;
  changeType: InstitutionalChangeType;
  changePercent: number | null;
  valueUsd: number;
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
