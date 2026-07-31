"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { History, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type AuditEntry = {
  id: string;
  action: string;
  moduleKey: string;
  fileName?: string | null;
  rowsImported?: number;
  rowsExported?: number;
  rowsUpdated?: number;
  rowsDuplicates?: number;
  rowsFailed?: number;
  errors?: number;
  ipAddress?: string | null;
  userEmail?: string | null;
  createdAt: string;
};

const ACTION_COLOR: Record<string, string> = {
  import: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  export: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  backup: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  restore: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  template: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  mapping: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
};

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [module, setModule] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/admin/datahub/audit?limit=300", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (json.error) throw new Error(json.error);
        setEntries(json.data);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const moduleOptions = useMemo(
    () => [...new Set(entries.map((e) => e.moduleKey))].sort(),
    [entries]
  );

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (!action || e.action === action) &&
          (!module || e.moduleKey === module)
      ),
    [entries, action, module]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <History className="h-4 w-4 text-primary-600" />
        <h2 className="text-lg font-bold">Audit log</h2>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="ml-auto h-9 rounded-lg border border-input bg-background px-2 text-xs"
        >
          <option value="">All actions</option>
          {Object.keys(ACTION_COLOR).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={module}
          onChange={(e) => setModule(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
        >
          <option value="">All modules</option>
          {moduleOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading audit log…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No audit entries"
          description="Imports, exports and backups are logged here."
          icon={History}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Module</th>
                    <th className="px-3 py-2">File</th>
                    <th className="px-3 py-2">Rows</th>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={ACTION_COLOR[e.action] || ""}>
                          {e.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{e.moduleKey}</td>
                      <td className="max-w-[160px] truncate px-3 py-2 font-mono text-xs">
                        {e.fileName || "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <AuditRows entry={e} />
                      </td>
                      <td className="px-3 py-2 text-xs">{e.userEmail || "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{e.ipAddress || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AuditRows({ entry }: { entry: AuditEntry }) {
  const bits: string[] = [];
  if (entry.rowsImported) bits.push(`${entry.rowsImported} in`);
  if (entry.rowsExported) bits.push(`${entry.rowsExported} out`);
  if (entry.rowsUpdated) bits.push(`${entry.rowsUpdated} upd`);
  if (entry.rowsDuplicates) bits.push(`${entry.rowsDuplicates} dup`);
  if (entry.rowsFailed) bits.push(`${entry.rowsFailed} fail`);
  if (entry.errors) bits.push(`${entry.errors} err`);
  return <>{bits.length ? bits.join(" · ") : "—"}</>;
}
