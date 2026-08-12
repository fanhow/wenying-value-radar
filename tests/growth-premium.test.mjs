import assert from "node:assert/strict";
import test from "node:test";
import { assessGrowthPremium } from "../lib/growth-premium.ts";

function stock(overrides = {}) {
  return {
    price: 300,
    eps: 2,
    fairValue: 30,
    revenueGrowth: 4,
    assumptions: { structuralThemes: [] },
    institutionalSignal: undefined,
    fundPortfolioPe: undefined,
    ...overrides,
  };
}

test("enables growth-premium mode only after two independent signals", () => {
  const assessment = assessGrowthPremium(stock({
    institutionalSignal: { heldByCount: 2, increasedByCount: 1 },
  }));

  assert.equal(assessment.enabled, true);
  assert.equal(assessment.triggerCount, 3);
  assert.deepEqual(assessment.triggers, ["institutional", "market-multiple", "price-premium"]);
  assert.equal(assessment.marketPe, 150);
  assert.equal(assessment.historicalPremium, 9);
});

test("keeps an ordinary stock on the standard fair-value presentation", () => {
  const assessment = assessGrowthPremium(stock({
    price: 20,
    eps: 2,
    fairValue: 22,
    revenueGrowth: 4,
  }));

  assert.equal(assessment.enabled, false);
  assert.equal(assessment.triggerCount, 0);
  assert.deepEqual(assessment.triggers, []);
});

test("shows the EPS growth required to trade at the fund median multiple", () => {
  const assessment = assessGrowthPremium(stock({
    fundPortfolioPe: {
      sampleSize: 20,
      averagePe: 50,
      medianPe: 40,
      valueWeightedAveragePe: 45,
      lowestPe: 12,
      highestPe: 180,
    },
    assumptions: { structuralThemes: [{ id: "ai" }] },
  }));

  assert.equal(assessment.impliedEpsAtFundMedianPe, 7.5);
  assert.equal(assessment.requiredEpsGrowth, 2.75);
});

test("uses the de-duplicated fund median for the headline and keeps raw observations transparent", () => {
  const assessment = assessGrowthPremium(stock({
    fundPortfolioPe: {
      sampleSize: 12,
      uniqueSampleSize: 8,
      averagePe: 48,
      medianPe: 50,
      lowerQuartilePe: 30,
      upperQuartilePe: 75,
      p90Pe: 110,
      p95Pe: 160,
      valueWeightedAveragePe: 52,
      lowestPe: 12,
      highestPe: 180,
      uniqueAveragePe: 40,
      uniqueMedianPe: 40,
      uniqueLowerQuartilePe: 25,
      uniqueUpperQuartilePe: 60,
      uniqueP95Pe: 130,
      freshSampleSize: 12,
      agingSampleSize: 0,
      staleSampleSize: 0,
      unknownSampleSize: 0,
      uniqueFreshSampleSize: 8,
      uniqueAgingSampleSize: 0,
      uniqueStaleSampleSize: 0,
      uniqueUnknownSampleSize: 0,
      medianFinancialAgeDays: 20,
      dataQuality: "fresh",
    },
    assumptions: { structuralThemes: [{ id: "ai" }] },
  }));

  assert.equal(assessment.impliedEpsAtFundMedianPe, 7.5);
  assert.equal(assessment.fundObservationMedianPe, 50);
});
