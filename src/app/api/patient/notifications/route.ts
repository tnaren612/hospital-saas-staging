import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteNotification,
  getPatientNotifications,
  markNotificationRead,
} from "@/lib/patient/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getPatientNotifications();
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["read", "delete"]),
});

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (parsed.data.action === "read") {
    const res = await markNotificationRead(parsed.data.id);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error || "Failed" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  const res = await deleteNotification(parsed.data.id);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error || "Failed" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
