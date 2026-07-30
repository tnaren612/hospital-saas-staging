/**
 * Server helper — block API/page when hospital module is disabled.
 */

import { NextResponse } from "next/server";
import { getHospitalConfig } from "@/lib/hospital/service";
import type { ModuleKey } from "@/lib/hospital/types";
import { resolveHospitalSlug } from "@/lib/hospital/resolve-tenant";
import { headers, cookies } from "next/headers";

export async function assertModuleEnabled(
  module: ModuleKey,
  slug?: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const hdrs = await headers();
  const cookieStore = await cookies();
  const resolved =
    slug ||
    resolveHospitalSlug({
      host: hdrs.get("host"),
      cookieSlug: cookieStore.get("ssh_hospital_slug")?.value,
      headerSlug: hdrs.get("x-hospital-slug"),
    });

  const config = await getHospitalConfig({ slug: resolved });
  if (!config.modules[module]) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Module disabled for this hospital",
          code: "MODULE_DISABLED",
          module,
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}
