import { NextResponse } from "next/server";
import { authorize, makeProvider, resolveModule } from "../_lib";
import type { BrowseQuery } from "@/lib/datahub/provider";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ module: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;

  const { module: key } = await params;
  const { module, error: modErr } = resolveModule(key);
  if (modErr || !module) return modErr!;

  const url = new URL(request.url);
  const query: BrowseQuery = {
    search: url.searchParams.get("search") || undefined,
    page: Number(url.searchParams.get("page") || 1),
    pageSize: Number(url.searchParams.get("pageSize") || 25),
    all: url.searchParams.get("all") === "1",
  };

  const sortCol = url.searchParams.get("sort");
  if (sortCol) {
    query.sort = {
      column: sortCol,
      asc: url.searchParams.get("asc") !== "0",
    };
  }
  const filtersRaw = url.searchParams.get("filters");
  if (filtersRaw) {
    try {
      query.filters = JSON.parse(filtersRaw);
    } catch {
      /* ignore malformed filters */
    }
  }
  const columnsRaw = url.searchParams.get("columns");
  if (columnsRaw) {
    query.columns = columnsRaw.split(",").filter(Boolean);
  }

  try {
    const provider = await makeProvider();
    const { rows, total } = await provider.browse(
      module,
      ctx.hospitalId,
      query
    );
    return NextResponse.json({ data: { rows, total } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to browse" },
      { status: 500 }
    );
  }
}
