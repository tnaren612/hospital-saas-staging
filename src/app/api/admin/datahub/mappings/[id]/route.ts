import { NextResponse } from "next/server";
import { authorize, readJson } from "../../_lib";
import { deleteMapping, getMapping, saveMapping } from "@/lib/datahub/mappings";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;
  const { id } = await params;

  const { body, error: bodyErr } = await readJson<{
    name?: string;
    columnMap?: Record<string, string>;
  }>(request);
  if (bodyErr || !body) return bodyErr!;

  const existing = await getMapping(id);
  if (!existing) {
    return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
  }

  const saved = await saveMapping({
    id,
    name: body.name || existing.name,
    moduleKey: existing.moduleKey,
    columnMap: body.columnMap || existing.columnMap,
    hospitalId: ctx.hospitalId,
    createdBy: ctx.actor.id,
  });
  if (!saved) {
    return NextResponse.json({ error: "Failed to update mapping" }, { status: 500 });
  }
  return NextResponse.json({ data: saved });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;
  const { id } = await params;

  const ok = await deleteMapping(id, ctx.hospitalId);
  if (!ok) {
    return NextResponse.json({ error: "Failed to delete mapping" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
