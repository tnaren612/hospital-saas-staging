"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ArrowRightLeft, Loader2, Trash2, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { CatalogModule } from "./data-management-manager";

type Mapping = {
  id: string;
  name: string;
  moduleKey: string;
  columnMap: Record<string, string>;
  updatedAt: string;
};

export function MappingManager({
  modules,
}: {
  modules: CatalogModule[];
  actorEmail: string | null;
  actorId: string | null;
}) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/datahub/mappings${filter ? `?module=${filter}` : ""}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Load failed");
      setMappings(json.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    if (!window.confirm("Delete this mapping?")) return;
    const res = await fetch(`/api/admin/datahub/mappings/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMappings((prev) => prev.filter((m) => m.id !== id));
      toast.success("Mapping deleted");
    } else {
      toast.error("Failed to delete mapping");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Reusable column mappings are created from the{" "}
          <strong>Import</strong> tab — run a preview, then “Save as mapping”.
          Saved mappings can be reused on future imports.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <ArrowRightLeft className="h-4 w-4 text-primary-600" />
        <h2 className="text-lg font-bold">Saved mappings</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="ml-auto h-9 rounded-lg border border-input bg-background px-2 text-xs"
        >
          <option value="">All modules</option>
          {modules.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading mappings…
        </div>
      ) : mappings.length === 0 ? (
        <EmptyState
          title="No saved mappings"
          description="Run an import and save its column mapping to reuse it later."
          icon={ArrowRightLeft}
        />
      ) : (
        <div className="space-y-2">
          {mappings.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    {m.name}
                    <Badge variant="secondary">
                      {modules.find((x) => x.key === m.moduleKey)?.label || m.moduleKey}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {Object.keys(m.columnMap).length} columns · updated{" "}
                    {new Date(m.updatedAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(m.id)}
                  className="text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
