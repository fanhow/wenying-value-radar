/**
 * Small, auditable sector corrections for public market snapshots.
 *
 * Nasdaq/Yahoo labels are useful defaults, but a few issuers can be placed in
 * a broad technology bucket after a corporate separation.  Those labels can
 * contaminate peer multiples and fund-sector summaries.  Unknown tickers keep
 * the supplied label rather than being guessed from a company name.
 */
const TICKER_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ["GE", "Industrials"],
  ["GEV", "Industrials"],
  ["CNR", "Industrials"],
]);

function normalizedTicker(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\.(TW|TWO)$/, "");
}

/** Return a corrected broad sector without inventing a sector for unknown rows. */
export function normalizeSector(ticker: unknown, _name: unknown, sector: unknown) {
  const override = TICKER_OVERRIDES.get(normalizedTicker(ticker));
  if (override) return override;
  const supplied = String(sector ?? "").trim();
  return supplied || "Other / unavailable";
}

export function sectorOverrideForTicker(ticker: unknown) {
  return TICKER_OVERRIDES.get(normalizedTicker(ticker));
}
