import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/monitoring/error
 * Client-side error reports (from error boundaries).
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`err-report:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  console.error(
    JSON.stringify({
      type: "client_error",
      message: String((body as { message?: string }).message || "unknown"),
      digest: String((body as { digest?: string }).digest || ""),
      path: String((body as { path?: string }).path || ""),
      ts: new Date().toISOString(),
    })
  );

  return NextResponse.json({ ok: true });
}
