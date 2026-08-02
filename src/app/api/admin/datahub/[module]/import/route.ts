import { NextResponse } from "next/server";
import {
  authorize,
  getClientIp,
  getDataConfig,
  makeProvider,
  resolveModule,
} from "../../_lib";
import { runImport } from "@/lib/datahub/import-engine";
import { isModuleEnabled } from "@/lib/datahub/registry";
import { getMapping } from "@/lib/datahub/mappings";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ module: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;

  const { module: key } = await params;
  const { module, error: modErr } = resolveModule(key);
  if (modErr || !module) return modErr!;

  const config = await getDataConfig();
  if (!isModuleEnabled(config, module.key)) {
    return NextResponse.json(
      { error: `Module "${module.label}" is disabled for data management.` },
      { status: 403 }
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const mode = String(form.get("mode") || "preview") === "commit" ? "commit" : "preview";
  const duplicateMode = String(form.get("duplicateMode") || "") === "skip" ? "skip" : "update";

  // Resolve column mapping: explicit JSON map, or a saved mapping by id.
  let mapping: Record<string, string> | undefined;
  const mappingRaw = form.get("mapping");
  if (typeof mappingRaw === "string" && mappingRaw) {
    try {
      mapping = JSON.parse(mappingRaw);
    } catch {
      /* ignore malformed mapping */
    }
  }
  const mappingId = form.get("mappingId");
  if (!mapping && typeof mappingId === "string" && mappingId) {
    const saved = await getMapping(mappingId);
    if (saved) mapping = saved.columnMap;
  }

  try {
    const provider = await makeProvider();
    const bytes = await file.arrayBuffer();
    const summary = await runImport({
      module,
      hospitalId: ctx.hospitalId,
      provider,
      config,
      file: { name: file.name, bytes },
      mapping,
      mode,
      duplicateMode,
      actor: ctx.actor,
      ipAddress: getClientIp(request),
    });
    return NextResponse.json({ data: summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 500 }
    );
  }
}
