import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { getNotificationService } from "@/lib/notifications/notification-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  const svc = getNotificationService();
  const stats = await svc.stats();
  const providers = svc.describeProviders();
  return NextResponse.json({ stats, providers });
}
