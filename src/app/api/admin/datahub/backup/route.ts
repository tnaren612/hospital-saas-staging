import { NextResponse } from "next/server";
import { authorize, getClientIp, makeProvider } from "../_lib";
import {
  createBackup,
  serializeBackup,
  auditBackupAction,
} from "@/lib/datahub/backup";
import { listBackups, recordBackup } from "@/lib/datahub/records";

export const dynamic = "force-dynamic";

export async function GET() {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;
  const data = await listBackups(ctx.hospitalId);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const { ctx, error } = await authorize();
  if (error || !ctx) return error!;

  try {
    const provider = await makeProvider();
    const manifest = await createBackup(provider, ctx.hospitalId);
    const text = serializeBackup(manifest);
    const totalRows = manifest.tables.reduce((s, t) => s + t.rows.length, 0);
    const fileName = `backup-${manifest.createdAt.replace(/[:T]/g, "-").slice(0, 16)}.json`;

    await recordBackup({
      name: `Backup ${manifest.createdAt.slice(0, 10)}`,
      fileName,
      rows: totalRows,
      sizeBytes: Buffer.byteLength(text),
      checksum: manifest.checksum,
      hospitalId: ctx.hospitalId,
    });
    await auditBackupAction({
      action: "backup",
      hospitalId: ctx.hospitalId,
      actor: ctx.actor,
      ipAddress: getClientIp(request),
      fileName,
      rows: totalRows,
    });

    return new Response(text, {
      headers: {
        "Content-Type": "application/json;charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Backup failed" },
      { status: 500 }
    );
  }
}
