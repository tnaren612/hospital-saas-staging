import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/monitoring/vitals
 * Lightweight CWV ingest — logs structured metrics (extend to APM later).
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`vitals:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const name = String((body as { name?: string }).name || "");
  const value = Number((body as { value?: number }).value);
  const path = String((body as { path?: string }).path || "");

  if (!name || !Number.isFinite(value)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Structured log for Vercel / host log drains
  console.info(
    JSON.stringify({
      type: "web_vital",
      name,
      value,
      path,
      ts: new Date().toISOString(),
    })
  );

  return NextResponse.json({ ok: true });
}
