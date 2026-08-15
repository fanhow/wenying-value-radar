import type { TechnicalAnalysis } from "./technical-analysis.ts";
import {
  readTechnicalScanTargets,
  saveTechnicalAlert,
  saveTechnicalScanRun,
  type TechnicalWatchSubscription,
} from "./technical-alert-store.ts";

export const TECHNICAL_ALERT_CRON = "30 22 * * 1-5";

type TechnicalAlertJobOptions = {
  database?: D1Database;
  clientId?: string;
  now?: Date;
  loadAnalysis: (target: TechnicalWatchSubscription) => Promise<TechnicalAnalysis | null>;
};

export async function runTechnicalAlertJob(options: TechnicalAlertJobOptions) {
  const startedAt = (options.now ?? new Date()).toISOString();
  const targets = await readTechnicalScanTargets(options.clientId ? 20 : 48, options.database, options.clientId);
  let alertCount = 0;
  let errorCount = 0;

  for (let start = 0; start < targets.length; start += 4) {
    const batch = targets.slice(start, start + 4);
    const results = await Promise.allSettled(batch.map(async (target) => {
      const analysis = await options.loadAnalysis(target);
      if (!analysis) throw new Error("history unavailable");
      return saveTechnicalAlert(target, analysis, startedAt, options.database);
    }));
    for (const result of results) {
      if (result.status === "rejected") errorCount += 1;
      else if (result.value) alertCount += 1;
    }
  }

  const status = targets.length > 0 && errorCount === targets.length
    ? "failed"
    : errorCount > 0
      ? "partial"
      : "succeeded";
  const run = {
    status: status as "succeeded" | "partial" | "failed",
    startedAt,
    finishedAt: new Date().toISOString(),
    targetCount: targets.length,
    alertCount,
    errorCount,
  };
  await saveTechnicalScanRun(run, options.database);
  return run;
}
