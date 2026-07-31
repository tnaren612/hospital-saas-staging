import { NextResponse } from "next/server";
import { authorize, getClientIp, makeProvider } from "../../_lib";
import {
  parseBackup,
  verifyBackup,
  restoreBackup,
  auditBackupAction,
} from "@/lib/datahub/backup";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;

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
  if (!integrity.ok) {
    return NextResponse.json(
      {
        error:
          "Backup integrity check failed. The file may be corrupt or tampered with.",
        integrity,
      },
      { status: 400 }
    );
  }

  try {
    const provider = await makeProvider();
    const result = await restoreBackup(provider, ctx.hospitalId, manifest);
    await auditBackupAction({
      action: "restore",
      hospitalId: ctx.hospitalId,
      actor: ctx.actor,
      ipAddress: getClientIp(request),
      fileName: file.name,
      rows: result.restored,
    });
    return NextResponse.json({ data: result, ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Restore failed" },
      { status: 500 }
    );
  }
}
