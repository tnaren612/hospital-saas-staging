import { NextResponse } from "next/server";
import { authorize, getDataConfig, makeProvider } from "./_lib";
import { getEnabledModules, getAllModules } from "@/lib/datahub/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;

  try {
    const config = await getDataConfig();
    const provider = await makeProvider();
    const modules = getEnabledModules(config);

    const rows = await Promise.all(
      modules.map(async (m) => {
        let count = 0;
        try {
          count = await provider.count(m, ctx.hospitalId);
        } catch {
          count = 0;
        }
        return {
          key: m.key,
          label: m.label,
          description: m.description,
          source: m.source,
          table: m.table,
          titleField: m.titleField,
          fieldCount: m.fields.length,
          uniqueKeys: m.uniqueKeys,
          relationships: m.relationships || [],
          count,
        };
      })
    );

    const totalRecords = rows.reduce((s, r) => s + r.count, 0);
    const tableCount = new Set(
      getAllModules().map((m) => m.table)
    ).size;

    return NextResponse.json({
      data: {
        modules: rows,
        stats: {
          modules: rows.length,
          tables: tableCount,
          totalRecords,
        },
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load data catalog" },
      { status: 500 }
    );
  }
}
