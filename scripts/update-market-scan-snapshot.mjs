import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildLiveMarketScan } from "../app/api/market-scan/route.ts";

const outputPath = fileURLToPath(new URL("../lib/market-scan-snapshot.json", import.meta.url));
const { payload, taiwanUniverse } = await buildLiveMarketScan();
const snapshot = {
  ...payload,
  taiwanUniverse,
  generatedAt: new Date().toISOString(),
};

await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Updated market scan snapshot: ${snapshot.candidates?.length ?? 0} undervalued, ${snapshot.overvaluedCandidates?.length ?? 0} overvalued.`);
