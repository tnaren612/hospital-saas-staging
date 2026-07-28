import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { getNotificationService } from "@/lib/notifications/notification-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    processQueue?: boolean;
    limit?: number;
  };

  const svc = getNotificationService();

  if (body.processQueue) {
    const r = await svc.processRetryQueue(body.limit || 20);
    return NextResponse.json({
      ok: true,
      processed: r.processed,
      succeeded: r.ok,
    });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const result = await svc.retry(body.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
