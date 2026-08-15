import { NextRequest, NextResponse } from "next/server";
import { loadPublicTechnicalData } from "../../../lib/public-technical-data";
import {
  readTechnicalAlerts,
  syncTechnicalWatchlist,
  validTechnicalClientId,
  type TechnicalWatchSubscription,
} from "../../../lib/technical-alert-store";
import { runTechnicalAlertJob } from "../../../lib/technical-alert-scheduler";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId") ?? "";
  if (!validTechnicalClientId(clientId)) return NextResponse.json({ error: "invalid client" }, { status: 400 });
  return NextResponse.json(await readTechnicalAlerts(clientId));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      action?: "sync" | "scan";
      clientId?: string;
      subscriptions?: TechnicalWatchSubscription[];
    };
    const clientId = String(body.clientId ?? "");
    if (!validTechnicalClientId(clientId)) return NextResponse.json({ error: "invalid client" }, { status: 400 });
    if (body.action === "scan") {
      const scan = await runTechnicalAlertJob({
        clientId,
        loadAnalysis: async (target) => (await loadPublicTechnicalData(target.ticker, target.market))?.technicalAnalysis ?? null,
      });
      return NextResponse.json({ scan, ...(await readTechnicalAlerts(clientId)) });
    }
    const saved = await syncTechnicalWatchlist(clientId, Array.isArray(body.subscriptions) ? body.subscriptions : []);
    return NextResponse.json({ saved, ...(await readTechnicalAlerts(clientId)) });
  } catch {
    return NextResponse.json({ error: "unable to update technical alerts" }, { status: 422 });
  }
}
