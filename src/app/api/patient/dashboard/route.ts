import { NextResponse } from "next/server";
import { getPatientDashboard } from "@/lib/patient/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getPatientDashboard();
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
