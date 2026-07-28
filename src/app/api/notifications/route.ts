import { NextResponse } from "next/server";
import { getNotificationService } from "@/lib/notifications/notification-service";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireHmsAdmin } from "@/lib/hms/server";
import type {
  NotificationChannel,
  NotificationStatus,
} from "@/lib/notifications/core/types";

export const dynamic = "force-dynamic";

/** GET — admin notification center (list + filters) */
export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(request.url);
  const svc = getNotificationService();
  const result = await svc.list({
    channel: (searchParams.get("channel") as NotificationChannel) || undefined,
    status: (searchParams.get("status") as NotificationStatus) || undefined,
    provider: searchParams.get("provider") || undefined,
    q: searchParams.get("q") || undefined,
    page: Number(searchParams.get("page") || 1),
    pageSize: Number(searchParams.get("pageSize") || 20),
  });

  return NextResponse.json(result);
}

/** POST — send notification (admin / system) */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`notify-send:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const channel = String(body.channel || "email") as NotificationChannel;
  const templateId = String(body.templateId || body.template_id || "generic");
  const recipient = String(body.recipient || "").trim();
  if (!recipient) {
    return NextResponse.json({ error: "recipient required" }, { status: 400 });
  }

  const vars =
    (body.vars as Record<string, string | number | boolean | null>) || {};

  const svc = getNotificationService();
  const result = await svc.send({
    channel,
    templateId,
    recipient,
    vars,
    patientId: body.patientId ? String(body.patientId) : null,
    appointmentId: body.appointmentId ? String(body.appointmentId) : null,
    force: body.force !== false,
    subject: body.subject ? String(body.subject) : undefined,
    meta: { vars, source: "admin_api" },
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
