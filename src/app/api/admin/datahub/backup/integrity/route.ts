import { NextResponse } from "next/server";
import { authorize } from "../../_lib";
import { parseBackup, verifyBackup } from "@/lib/datahub/backup";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await authorize();
  if (error) return error;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing backup file" }, { status: 400 });
  }

  const text = await file.text();
  let manifest;
  try {
    manifest = parseBackup(text);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unsupported backup file" },
      { status: 400 }
    );
  }

  const integrity = verifyBackup(text);
  const totalRows = manifest.tables.reduce((s, t) => s + t.rows.length, 0);
  return NextResponse.json({
    data: {
      ok: integrity.ok,
      checksum: integrity.actualChecksum,
      expectedChecksum: integrity.expectedChecksum,
      tables: manifest.tables.map((t) => ({
        moduleKey: t.moduleKey,
        rows: t.rows.length,
      })),
      totalRows,
      createdAt: manifest.createdAt,
      hospitalId: manifest.hospitalId,
    },
  });
}
