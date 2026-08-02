import { NextResponse } from "next/server";
import { authorize, readJson, getDataConfig } from "../_lib";
import { resolveDataManagementConfig } from "@/lib/datahub/settings";
import { updateHospitalSettings } from "@/lib/hospital/service";
import type { DataManagementConfig } from "@/lib/datahub/types";

export const dynamic = "force-dynamic";

const ALLOWED_FORMATS = ["xlsx", "xls", "csv"];
const ALLOWED_MODES = ["update", "skip"];

export async function GET() {
  const { error } = await authorize();
  if (error) return error;
  const data = await getDataConfig();
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;

  const { body, error: bodyErr } = await readJson<Partial<DataManagementConfig>>(
    request
  );
  if (bodyErr || !body) return bodyErr!;

  const current = await getDataConfig();
  const next: Partial<DataManagementConfig> = {
    enabled:
      typeof body.enabled === "boolean" ? body.enabled : current.enabled,
    storage_mode:
      body.storage_mode === "sqlite" ||
      body.storage_mode === "excel" ||
      body.storage_mode === "hybrid"
        ? body.storage_mode
        : current.storage_mode,
    storage_file:
      typeof body.storage_file === "string"
        ? body.storage_file
        : current.storage_file,
    allowedFormats: Array.isArray(body.allowedFormats)
      ? body.allowedFormats.filter((f) => ALLOWED_FORMATS.includes(f))
      : current.allowedFormats,
    maxFileSizeMB:
      typeof body.maxFileSizeMB === "number"
        ? Math.min(100, Math.max(1, body.maxFileSizeMB))
        : current.maxFileSizeMB,
    duplicateMode: ALLOWED_MODES.includes(body.duplicateMode || "")
      ? body.duplicateMode
      : current.duplicateMode,
    modules: body.modules || current.modules,
  };
  if (body.backup) {
    next.backup = {
      enabled:
        typeof body.backup.enabled === "boolean"
          ? body.backup.enabled
          : current.backup.enabled,
      scheduleCron:
        typeof body.backup.scheduleCron === "string" && body.backup.scheduleCron
          ? body.backup.scheduleCron
          : null,
      keepCount:
        typeof body.backup.keepCount === "number"
          ? Math.min(100, Math.max(1, body.backup.keepCount))
          : current.backup.keepCount,
    };
  }

  const updated = await updateHospitalSettings(
    { data_management: next as DataManagementConfig },
    ctx.actor.id
  );
  return NextResponse.json({
    data: resolveDataManagementConfig(updated.data_management),
    ok: true,
  });
}
