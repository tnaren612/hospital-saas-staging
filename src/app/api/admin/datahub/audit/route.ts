import { NextResponse } from "next/server";
import { authorize } from "../_lib";
import { listDataAudit } from "@/lib/datahub/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;

  const url = new URL(request.url);
  const moduleKey = url.searchParams.get("module") || undefined;
  const action = url.searchParams.get("action") || undefined;
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") || 100))
  );

  const data = await listDataAudit(ctx.hospitalId, {
    moduleKey,
    action,
    limit,
  });
  return NextResponse.json({ data });
}
