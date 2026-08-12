export const FLAT_VALUATION_GAP = 0.05;

export type ValuationDirection = "up" | "flat" | "down";

export function valuationDirection(value: number): ValuationDirection {
  if (!Number.isFinite(value) || Math.abs(value) <= FLAT_VALUATION_GAP) return "flat";
  return value > 0 ? "up" : "down";
}

export function valuationDirectionSymbol(direction: ValuationDirection) {
  return direction === "up" ? "↗" : direction === "down" ? "↘" : "→";
}
