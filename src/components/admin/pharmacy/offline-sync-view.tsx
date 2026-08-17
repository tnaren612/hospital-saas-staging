"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  RefreshCw,
  Cloud,
  CloudOff,
  Database,
  History,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOfflineStore, useOfflineSync, useCloudStatus } from "@/lib/pharmacy/offline";
import type { OfflineAuditEntry, OfflineMutation, SyncEntity } from "@/lib/pharmacy/offline";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  syncing: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  applied: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  conflict: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  blocked: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
};

const ENTITY_LABEL: Record<SyncEntity, string> = {
  settings: "Settings",
  branch: "Branches",
  shift: "Shifts",
  sale: "Sales",
  return: "Returns",
  held_bill: "Held bills",
  medicine: "Medicines",
  customer: "Customers",
  supplier: "Suppliers",
  purchase_order: "Purchase orders",
  category: "Categories",
};

export function OfflineSyncView() {
  const storage = useOfflineStore();
  const cloud = useCloudStatus();
  const sync = useOfflineSync({
    autoSync: true,
    pullEntities: ["sale", "return", "held_bill", "branch", "shift", "settings"],
  });
  const [queue, setQueue] = useState<OfflineMutation[]>([]);
  const [audit, setAudit] = useState<OfflineAuditEntry[]>([]);

  const refresh = async () => {
    setQueue(await storage.listQueue());
    setAudit(await storage.listAudit(100));
  };

  useEffect(() => {
    void refresh();
  }, [storage]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSync = async () => {
    const result = await sync.syncNow();
    await refresh();
    if (result.errors.length) {
      toast.error(`Sync finished with ${result.errors.length} error(s)`);
    } else {
      toast.success(
        `Synced: ${result.pushed} pushed, ${result.pulled} pulled, ${result.conflicts} conflicts`
      );
    }
  };

  const doVerify = async () => {
    const check = await sync.verify();
    toast(check.ok ? "Integrity check passed" : "Integrity mismatch found");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Offline Sync"
        description="Local-first queue, background sync and conflict resolution"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void doVerify()}>
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Verify integrity
            </Button>
            <Button size="sm" onClick={() => void doSync()} disabled={sync.syncing}>
              <RefreshCw className={`h-4 w-4 ${sync.syncing ? "animate-spin" : ""}`} aria-hidden />
              {sync.syncing ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            {cloud.state === "connected" ? (
              <Cloud className="h-8 w-8 text-emerald-500" aria-hidden />
            ) : (
              <CloudOff className="h-8 w-8 text-amber-500" aria-hidden />
            )}
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="font-semibold">
                {cloud.state === "connected"
                  ? "Cloud connected"
                  : cloud.state === "unavailable"
                    ? "Cloud unavailable — working offline"
                    : cloud.state === "syncing"
                      ? "Syncing…"
                      : "Cloud sync error"}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Database className="h-8 w-8 text-primary-500" aria-hidden />
            <div>
              <div className="text-sm text-muted-foreground">Pending / Failed</div>
              <div className="font-semibold">
                {sync.stats.pendingCount} / {sync.stats.failedCount}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <RefreshCw className="h-8 w-8 text-blue-500" aria-hidden />
            <div>
              <div className="text-sm text-muted-foreground">Last sync watermark</div>
              <div className="font-semibold">
                {sync.stats.lastSyncAt ? sync.stats.lastSyncAt.slice(0, 16).replace("T", " ") : "Never"}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <History className="h-8 w-8 text-teal-500" aria-hidden />
            <div>
              <div className="text-sm text-muted-foreground">Applied</div>
              <div className="font-semibold">{sync.stats.appliedCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {sync.stats.lastError && (
        <Card className="border-rose-200 bg-rose-50 dark:bg-rose-950/30">
          <CardContent className="p-4 text-sm text-rose-700 dark:text-rose-300">
            Last sync error: {sync.stats.lastError}
          </CardContent>
        </Card>
      )}

      {sync.integrity && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Integrity check — {sync.integrity.ok ? "passed" : "mismatch found"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {sync.integrity.checks.map((c) => (
              <div key={c.entity} className="flex items-center justify-between rounded-lg border p-2">
                <span>{ENTITY_LABEL[c.entity]}</span>
                <Badge variant="outline" className={c.match ? "text-emerald-600" : "text-rose-600"}>
                  {c.counted}/{c.recorded}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Mutation queue ({queue.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-2 overflow-y-auto p-4">
            {queue.map((op) => (
              <div key={op.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {op.action} {ENTITY_LABEL[op.entity]}
                  </span>
                  <Badge className={STATUS_BADGE[op.status] ?? ""}>{op.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {op.createdAt.slice(0, 16).replace("T", " ")} · attempt {op.attempts}/
                  {op.maxAttempts}
                  {op.lastError && (
                    <span className="mt-1 block break-words text-rose-600"> {op.lastError}</span>
                  )}
                </div>
                {["failed", "conflict", "blocked"].includes(op.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={async () => {
                      await sync.retryOp(op.id);
                      await refresh();
                      toast.success("Queued for retry");
                    }}
                  >
                    Retry
                  </Button>
                )}
              </div>
            ))}
            {queue.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Queue is empty — everything has synced.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Audit trail (offline)</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-2 overflow-y-auto p-4">
            {audit.map((a) => (
              <div key={a.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {a.actor} · {a.action}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.ts.slice(0, 16).replace("T", " ")}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {ENTITY_LABEL[a.entity]}
                  {a.entityId ? ` #${a.entityId}` : ""}
                </div>
              </div>
            ))}
            {audit.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No audit entries yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
