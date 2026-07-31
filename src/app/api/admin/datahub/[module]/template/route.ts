import { authorize, resolveModule } from "../../_lib";
import { buildTemplateWorkbook, templateFilename } from "@/lib/datahub/templates";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ module: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { error } = await authorize();
  if (error) return error;

  const { module: key } = await params;
  const { module, error: modErr } = resolveModule(key);
  if (modErr || !module) return modErr!;

  try {
    const wb = buildTemplateWorkbook(module);
    const filename = templateFilename(module);
    return new Response(wb, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Template failed", {
      status: 500,
    });
  }
}
