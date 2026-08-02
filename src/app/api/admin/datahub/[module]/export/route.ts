import { NextResponse } from "next/server";
import {
  authorize,
  getClientIp,
  getDataConfig,
  makeProvider,
  readJson,
  resolveModule,
} from "../../_lib";
import { runExport } from "@/lib/datahub/export-engine";
import type { ExportFormat } from "@/lib/datahub/export-engine";
import type { BrowseQuery } from "@/lib/datahub/provider";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ module: string }> };

const FORMATS: ExportFormat[] = ["csv", "xlsx", "pdf"];

export async function POST(request: Request, { params }: RouteParams) {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;

  const { module: key } = await params;
  const { module, error: modErr } = resolveModule(key);
  if (modErr || !module) return modErr!;

  const { body, error: bodyErr } = await readJson<{
    format?: string;
    search?: string;
    filters?: Record<string, unknown>;
    sort?: { column: string; asc?: boolean };
    columns?: string[];
  }>(request);
  if (bodyErr || !body) return bodyErr!;

  const format = body.format as ExportFormat;
  if (!FORMATS.includes(format)) {
    return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
  }

  const query: BrowseQuery = {
    search: body.search,
    filters: body.filters,
    columns: body.columns,
    sort: body.sort ? { column: body.sort.column, asc: body.sort.asc ?? true } : undefined,
  };

  try {
    const config = await getDataConfig();
    const provider = await makeProvider();
    const result = await runExport({
      module,
      hospitalId: ctx.hospitalId,
      provider,
      config,
      query,
      format,
      actor: ctx.actor,
      ipAddress: getClientIp(request),
    });

    const safeName = result.filename.replace(/[^\w.-]+/g, "_");
    return new Response(result.data, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Export failed" },
      { status: 500 }
    );
  }
}
