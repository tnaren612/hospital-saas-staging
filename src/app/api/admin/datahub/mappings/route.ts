import { NextResponse } from "next/server";
import { authorize, readJson } from "../_lib";
import { listMappings, saveMapping } from "@/lib/datahub/mappings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;

  const moduleKey = new URL(request.url).searchParams.get("module") || undefined;
  const data = await listMappings(ctx.hospitalId, moduleKey);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;

  const { body, error: bodyErr } = await readJson<{
    name: string;
    moduleKey: string;
    columnMap: Record<string, string>;
  }>(request);
  if (bodyErr || !body) return bodyErr!;
  if (!body.name || !body.moduleKey || !body.columnMap) {
    return NextResponse.json(
      { error: "name, moduleKey and columnMap are required" },
      { status: 400 }
    );
  }

  const saved = await saveMapping({
    name: body.name,
    moduleKey: body.moduleKey,
    columnMap: body.columnMap,
    hospitalId: ctx.hospitalId,
    createdBy: ctx.actor.id,
  });
  if (!saved) {
    return NextResponse.json({ error: "Failed to save mapping" }, { status: 500 });
  }
  return NextResponse.json({ data: saved }, { status: 201 });
}
