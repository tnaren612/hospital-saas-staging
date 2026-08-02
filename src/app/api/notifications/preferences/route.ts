import { NextResponse } from "next/server";
import { getNotificationService } from "@/lib/notifications/notification-service";
import { requirePatientSession } from "@/lib/patient/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveOwnPatientId } from "@/lib/auth/security";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function getOwnPatientId(userId: string): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.id ? String(data.id) : null;
  } catch {
    return null;
  }
}

/** GET ?patientId= (optional — defaults to the authenticated patient's own id) */
export async function GET(request: Request) {
  const session = await requirePatientSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requested = searchParams.get("patientId");
  const owned = resolveOwnPatientId(requested, await getOwnPatientId(session.user.id));
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const svc = getNotificationService();
  const prefs = await svc.getPreferences(owned.patientId);
  return NextResponse.json({ data: prefs });
}

/** PUT — save preferences for the authenticated patient only */
export async function PUT(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`notify-prefs:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await requirePatientSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    patientId?: string;
    email?: boolean;
    whatsapp?: boolean;
    sms?: boolean;
    all?: boolean;
  };

  const owned = resolveOwnPatientId(
    body.patientId || null,
    await getOwnPatientId(session.user.id)
  );
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const svc = getNotificationService();
  const prefs = await svc.savePreferences(owned.patientId, {
    email: body.email,
    whatsapp: body.whatsapp,
    sms: body.sms,
    all: body.all,
  });

  return NextResponse.json({ data: prefs });
}
