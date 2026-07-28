import { NextResponse } from "next/server";
import { getNotificationService } from "@/lib/notifications/notification-service";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET ?patientId= */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patientId") || "";
  if (!patientId) {
    return NextResponse.json({ error: "patientId required" }, { status: 400 });
  }
  const svc = getNotificationService();
  const prefs = await svc.getPreferences(patientId);
  return NextResponse.json({ data: prefs });
}

/** PUT — save preferences */
export async function PUT(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`notify-prefs:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    patientId?: string;
    email?: boolean;
    whatsapp?: boolean;
    sms?: boolean;
    all?: boolean;
  };

  if (!body.patientId) {
    return NextResponse.json({ error: "patientId required" }, { status: 400 });
  }

  const svc = getNotificationService();
  const prefs = await svc.savePreferences(body.patientId, {
    email: body.email,
    whatsapp: body.whatsapp,
    sms: body.sms,
    all: body.all,
  });

  return NextResponse.json({ data: prefs });
}
