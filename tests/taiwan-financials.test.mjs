import assert from "node:assert/strict";
import test from "node:test";
import { financialInputsFromTaiwanHistory, parseTaiwanFinancialTimeseries } from "../lib/taiwan-financials.ts";

function series(type, values) {
  return {
    meta: { type: [type] },
    [type]: values.map(([asOfDate, raw]) => ({ asOfDate, reportedValue: { raw } })),
  };
}

test("builds multi-year Taiwan financial inputs without changing the valuation engine", () => {
  const dates = ["2022-12-31", "2023-12-31", "2024-12-31", "2025-12-31"];
  const payload = { timeseries: { result: [
    series("annualDilutedEPS", dates.map((date, index) => [date, 2 + index])),
    series("annualTotalRevenue", dates.map((date, index) => [date, 1000 + index * 100])),
    series("annualOperatingCashFlow", dates.map((date, index) => [date, 180 + index * 10])),
    series("annualCapitalExpenditure", dates.map((date) => [date, -30])),
    series("annualTotalAssets", dates.map((date) => [date, 2000])),
    series("annualTotalLiabilitiesNetMinorityInterest", dates.map((date) => [date, 800])),
    series("annualStockholdersEquity", dates.map((date) => [date, 1200])),
    series("annualDilutedAverageShares", dates.map((date) => [date, 100])),
    series("annualNetIncome", dates.map((date) => [date, 130])),
    series("annualEBIT", dates.map((date) => [date, 160])),
  ] } };

  const rows = parseTaiwanFinancialTimeseries("2324", payload, "2026-08-12T00:00:00.000Z");
  const inputs = financialInputsFromTaiwanHistory(rows);
  assert.equal(rows.length, 4);
  assert.deepEqual(inputs?.epsHistory?.map((point) => point.value), [2, 3, 4, 5]);
  assert.equal(inputs?.financialDataDate, "2025-12-31");
  assert.ok(Math.abs(Number(inputs?.revenueGrowth) - 8.3333333333) < 1e-6);
  assert.equal(inputs?.fcfPerShare, 1.8);
  assert.equal(inputs?.debtRatio, 40);
  assert.equal(inputs?.revenuePerShare, 13);
});

test("prefers diluted EPS and share series when duplicate annual fields exist", () => {
  const payload = { timeseries: { result: [
    series("annualDilutedEPS", [["2025-12-31", 4.2]]),
    series("annualBasicEPS", [["2025-12-31", 4.4]]),
    series("annualDilutedAverageShares", [["2025-12-31", 200]]),
    series("annualOrdinarySharesNumber", [["2025-12-31", 210]]),
  ] } };
  const rows = parseTaiwanFinancialTimeseries("2915", payload);
  assert.equal(rows[0]?.eps, 4.2);
  assert.equal(rows[0]?.shares, 200);
});
