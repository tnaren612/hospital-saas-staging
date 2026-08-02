import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin } from "@/lib/hms/server";
import { isAdmin } from "@/lib/auth/roles";
import {
  getHospitalConfig,
  updateHospitalSettings,
} from "@/lib/hospital/service";
import { HOSPITAL_TYPES, MODULE_KEYS } from "@/lib/hospital/types";
import { writeAuthEvent } from "@/lib/auth/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  const role = gate.session?.profile.role;
  if (gate.session && !isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const data = await getHospitalConfig({ bypassCache: true });
  return NextResponse.json({ data });
}

const patchSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  hospital_type: z.enum(HOSPITAL_TYPES).optional(),
  branding: z.record(z.unknown()).optional(),
  contact: z.record(z.unknown()).optional(),
  localization: z.record(z.unknown()).optional(),
  legal: z.record(z.unknown()).optional(),
  modules: z.record(z.boolean()).optional(),
  prefixes: z.record(z.string()).optional(),
  payments: z.record(z.unknown()).optional(),
  email: z.record(z.unknown()).optional(),
  storage: z.record(z.unknown()).optional(),
  auth_providers: z.record(z.boolean()).optional(),
  templates: z.record(z.string()).optional(),
  seo: z.record(z.string()).optional(),
  social: z.record(z.string()).optional(),
  working_hours: z.record(z.string()).optional(),
  data_management: z.record(z.unknown()).optional(),
});

export async function PATCH(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  const role = gate.session?.profile.role;
  if (gate.session && !isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Sanitize modules keys
  if (parsed.data.modules) {
    const clean: Record<string, boolean> = {};
    for (const k of MODULE_KEYS) {
      if (k in parsed.data.modules) {
        clean[k] = Boolean(parsed.data.modules[k]);
      }
    }
    parsed.data.modules = clean;
  }

  const data = await updateHospitalSettings(
    parsed.data as Parameters<typeof updateHospitalSettings>[0],
    gate.session?.user.id || null
  );

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: role || undefined,
    success: true,
    metadata: { action: "hospital_settings_update", slug: data.slug },
  });

  return NextResponse.json({ data, ok: true });
}
