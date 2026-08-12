import { NextRequest, NextResponse } from "next/server";
import { saveArkImportObservations, type ArkImportObservation } from "../../../lib/ark-import-log";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { observations?: ArkImportObservation[] };
    const observations = Array.isArray(body.observations) ? body.observations.slice(0, 120) : [];
    const saved = await saveArkImportObservations(observations);
    return NextResponse.json({ saved });
  } catch {
    return NextResponse.json({ saved: 0, error: "Unable to save import observations" }, { status: 422 });
  }
}

