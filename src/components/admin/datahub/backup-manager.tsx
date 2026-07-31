"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Archive,
  Download,
  Upload,
  ShieldCheck,
  Loader2,
  CalendarClock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { downloadBlob } from "./table-browser";

type BackupRecord = {
  id: string;
  name: string;
  fileName: string | null;
  rows: number;
  sizeBytes: number;
  createdAt: string;
};

type RestoreResult = {
  tables: number;
  restored: number;
  failed: number;
  failures: string[];
};

type DataSettings = {
  enabled: boolean;
  duplicateMode: string;
  maxFileSizeMB: number;
  allowedFormats: string[];
  backup: { enabled: boolean; scheduleCron: string | null; keepCount: number };
};

export function BackupManager() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [settings, setSettings] = useState<DataSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    totalRows: number;
    tables: number;
    createdAt: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, sRes] = await Promise.all([
        fetch("/api/admin/datahub/backup", { cache: "no-store" }),
        fetch("/api/admin/datahub/settings", { cache: "no-store" }),
      ]);
      const bJson = await bRes.json();
      const sJson = await sRes.json();
      if (!bRes.ok) throw new Error(bJson.error || "Load failed");
      setBackups(bJson.data);
      if (sRes.ok && sJson.data) setSettings(sJson.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/datahub/backup", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Backup failed");
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const name = disp.match(/filename="?([^"]+)"?/)?.[1] || "backup.json";
      downloadBlob(blob, name);
      toast.success("Backup created and downloaded");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setCreating(false);
    }
  };

  const postFile = async (
    endpoint: "restore" | "integrity",
    file: File
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/admin/datahub/backup/${endpoint}`, {
      method: "POST",
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || "Request failed" };
    return { ok: true, data: json.data };
  };

  const onRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm("Restore from this backup? Existing matching records will be updated.")) return;
    try {
      const res = await postFile("restore", file);
      if (!res.ok) throw new Error(res.error);
      setRestoreResult(res.data as RestoreResult);
      setVerifyResult(null);
      toast.success("Restore completed");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    }
  };

  const onVerifyFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const res = await postFile("integrity", file);
      if (!res.ok) throw new Error(res.error);
      const d = res.data as {
        ok: boolean;
        totalRows: number;
        tables: number;
        createdAt: string;
      };
      setVerifyResult(d);
      setRestoreResult(null);
      toast.success(d.ok ? "Integrity verified" : "Integrity check failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verify failed");
    }
  };

  const schedule = settings?.backup;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2 font-semibold">
              <Archive className="h-5 w-5 text-primary-600" />
              Create backup
            </div>
            <p className="text-xs text-muted-foreground">
              Dumps every registered table into a single, integrity-checked
              JSON file.
            </p>
            <Button onClick={() => void create()} disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Create & download
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2 font-semibold">
              <Upload className="h-5 w-5 text-primary-600" />
              Restore
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a backup JSON to restore idempotently (upsert).
            </p>
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
              Choose backup file
              <input type="file" accept=".json" className="hidden" onChange={onRestoreFile} />
            </label>
            {restoreResult && (
              <div className="rounded-lg bg-muted p-3 text-xs">
                <Badge variant="success">{restoreResult.tables} tables</Badge>{" "}
                <Badge variant="teal">{restoreResult.restored} restored</Badge>{" "}
                <Badge variant={restoreResult.failed ? "warning" : "secondary"}>
                  {restoreResult.failed} failed
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-5 w-5 text-primary-600" />
              Verify integrity
            </div>
            <p className="text-xs text-muted-foreground">
              Recompute the checksum of a backup file to confirm it&apos;s intact.
            </p>
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
              Choose backup file
              <input type="file" accept=".json" className="hidden" onChange={onVerifyFile} />
            </label>
            {verifyResult && (
              <div className="rounded-lg bg-muted p-3 text-xs">
                {verifyResult.ok ? (
                  <span className="text-emerald-600">Integrity OK</span>
                ) : (
                  <span className="text-rose-600">Checksum mismatch</span>
                )}{" "}
                · {verifyResult.tables} tables · {verifyResult.totalRows} rows
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-6">
          <CalendarClock className="h-5 w-5 text-primary-600" />
          <div className="text-sm">
            <span className="font-semibold">Scheduled backups:</span>{" "}
            {schedule?.enabled ? (
              <>
                enabled · cron{" "}
                <code className="rounded bg-muted px-1 font-mono text-xs">
                  {schedule.scheduleCron || "—"}
                </code>{" "}
                · keep {schedule.keepCount}
              </>
            ) : (
              "disabled"
            )}
          </div>
          <p className="w-full text-xs text-muted-foreground">
            Schedule expression and retention are consumed by your serverless
            cron / scheduler. Configure under Admin → Settings → Data.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="mb-3 text-sm font-semibold">Recent backups</h3>
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading backups…
            </div>
          ) : backups.length === 0 ? (
            <EmptyState
              title="No backups yet"
              description="Create a backup to see it listed here."
              icon={Archive}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">File</th>
                    <th className="px-3 py-2">Rows</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{b.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{b.fileName}</td>
                      <td className="px-3 py-2">{b.rows.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        {(b.sizeBytes / 1024).toFixed(1)} KB
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(b.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
