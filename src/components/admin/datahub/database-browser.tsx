"use client";

import { useState } from "react";
import {
  Database,
  Table2,
  Boxes,
  Layers,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableBrowser } from "./table-browser";
import type { CatalogModule, CatalogStats } from "./data-management-manager";

export function DatabaseBrowser({
  modules,
  stats,
}: {
  modules: CatalogModule[];
  stats: CatalogStats | null;
}) {
  const [selected, setSelected] = useState<CatalogModule | null>(null);

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-sm font-medium text-primary-600 hover:underline"
        >
          ← All tables
        </button>
        <TableBrowser module={selected} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Layers} label="Modules" value={stats?.modules ?? modules.length} />
        <StatCard icon={Table2} label="Tables" value={stats?.tables ?? 0} />
        <StatCard icon={Boxes} label="Total records" value={stats?.totalRecords ?? 0} />
      </div>

      {modules.length === 0 ? (
        <EmptyState
          title="No modules available"
          description="Data Management may be disabled, or no modules are enabled in Settings."
          icon={Database}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Card key={m.key} className="transition hover:shadow-soft">
              <CardContent className="p-5">
                <button
                  type="button"
                  onClick={() => setSelected(m)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{m.label}</span>
                      <Badge variant={m.source === "config" ? "warning" : "success"}>
                        {m.source === "config" ? "config" : "db"}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {m.description}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                        {m.table}
                      </span>
                      <span>{m.count.toLocaleString()} rows</span>
                      <span>{m.fieldCount} fields</span>
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
