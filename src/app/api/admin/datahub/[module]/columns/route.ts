import { NextResponse } from "next/server";
import { authorize, resolveModule } from "../../_lib";
import { getImportableFields, getExportableFields } from "@/lib/datahub/registry";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ module: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { error } = await authorize();
  if (error) return error;

  const { module: key } = await params;
  const { module, error: modErr } = resolveModule(key);
  if (modErr || !module) return modErr!;

  const importable = getImportableFields(module).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required || false,
    unique: f.unique || false,
    options: f.options || [],
    note: f.note || "",
    sample: f.sample ?? "",
  }));

  const exportable = getExportableFields(module).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    system: f.system || false,
  }));

  return NextResponse.json({
    data: {
      module: { key: module.key, label: module.label },
      importable,
      exportable,
    },
  });
}
