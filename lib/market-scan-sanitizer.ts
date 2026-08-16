import type { Market } from "./valuation.ts";

/**
 * Normalizes single-period market ratio anomalies and IPO/reverse-split share
 * count artifacts for Taiwan & US stock scans.
 */
export function sanitizeMarketScanRatios(input: {
  ticker: string;
  name: string;
  market: Market;
  price: number;
  pe: number;
  pb: number;
  eps: number;
  bvps: number;
  revenueGrowth?: number | null;
  debtRatio?: number | null;
  fcfPerShare?: number | null;
  revenuePerShare?: number | null;
  ebitdaPerShare?: number | null;
  ebitPerShare?: number | null;
  cashPerShare?: number | null;
  debtPerShare?: number | null;
}) {
  const { market, price } = input;
  let { pe, pb, eps, bvps } = input;
  let revenuePerShare = input.revenuePerShare;
  let fcfPerShare = input.fcfPerShare;
  let ebitdaPerShare = input.ebitdaPerShare;
  let ebitPerShare = input.ebitPerShare;
  let cashPerShare = input.cashPerShare;
  let debtPerShare = input.debtPerShare;

  // 1. Sanity-check pre-IPO / reverse split share count artifacts in U.S. filings (e.g. TEM, FOUR, LOAR, QUBT)
  if (price > 0) {
    if (bvps > price * 5) {
      bvps = Math.min(bvps, price * 1.5);
    }
    if (Math.abs(eps) > price * 2) {
      eps = Math.sign(eps) * Math.min(Math.abs(eps), price * 0.25);
    }
    if (revenuePerShare !== undefined && revenuePerShare !== null && revenuePerShare > price * 8) {
      revenuePerShare = Math.min(revenuePerShare, price * 2.5);
    }
    if (fcfPerShare !== undefined && fcfPerShare !== null && Math.abs(fcfPerShare) > price * 3) {
      fcfPerShare = Math.sign(fcfPerShare) * Math.min(Math.abs(fcfPerShare), price * 0.35);
    }
    if (ebitdaPerShare !== undefined && ebitdaPerShare !== null && Math.abs(ebitdaPerShare) > price * 4) {
      ebitdaPerShare = Math.sign(ebitdaPerShare) * Math.min(Math.abs(ebitdaPerShare), price * 0.45);
    }
    if (ebitPerShare !== undefined && ebitPerShare !== null && Math.abs(ebitPerShare) > price * 4) {
      ebitPerShare = Math.sign(ebitPerShare) * Math.min(Math.abs(ebitPerShare), price * 0.40);
    }
    if (cashPerShare !== undefined && cashPerShare !== null && cashPerShare > price * 3) {
      cashPerShare = Math.min(cashPerShare, price * 0.5);
    }
    if (debtPerShare !== undefined && debtPerShare !== null && debtPerShare > price * 5) {
      debtPerShare = Math.min(debtPerShare, price * 1.2);
    }
  }

  // 2. Identify one-off non-operating disposal spikes (e.g. 2491 吉祥全 with PE = 1.08, ephemeral EPS > 90% of price)
  const isOneOffDisposalSpike = (pe > 0 && pe < 4.0 && (eps / (bvps || price)) > 0.30) || (eps > price * 0.4 && !input.revenueGrowth);

  let targetPe: number | undefined;
  let targetPb: number | undefined;
  let normalizedEps = eps;
  let normalizedBvps = bvps;

  if (isOneOffDisposalSpike) {
    // For asset-holding / one-off gain stocks:
    // Sustainable ROE is capped to long-term cost of capital (5% for cyclical asset holdings)
    const sustainableRoe = market === "TW" ? 0.05 : 0.07;
    // In InvestingPro, tangible Book Value with conservative holding multiple (0.80x - 1.00x) anchors the valuation
    normalizedBvps = bvps > price * 1.0 ? Math.min(bvps, price * 0.75) : (bvps > 0 ? bvps : price * 0.75);
    normalizedEps = Math.min(eps, normalizedBvps * sustainableRoe);
    targetPe = market === "TW" ? 12.0 : 13.5;
    targetPb = market === "TW" ? 0.90 : 1.05;
  }

  return {
    eps: normalizedEps,
    bvps: normalizedBvps,
    revenuePerShare,
    fcfPerShare,
    ebitdaPerShare,
    ebitPerShare,
    cashPerShare,
    debtPerShare,
    targetPe,
    targetPb,
    isOneOffDisposalSpike
  };
}
