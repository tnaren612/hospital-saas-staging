"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Cloud,
  Database,
  FileSpreadsheet,
  GitMerge,
  Loader2,
  Save,
  AlertTriangle,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StorageMode } from "@/lib/datahub/types";

type Mode = StorageMode;

const MODES: {
  id: Mode;
  label: string;
  description: string;
  icon: typeof Database;
  needsFile: boolean;
  warn?: string;
}[] = [
  {
    id: "supabase",
    label: "Hospital / Supabase",
    description: "Integrated mode — data lives in your Supabase/PostgreSQL database. Existing behavior, unchanged.",
    icon: Cloud,
    needsFile: false,
  },
  {
    id: "sqlite",
    label: "Standalone (SQLite)",
    description: "Runs fully offline on this machine's local SQLite database. No internet required.",
    icon: Database,
    needsFile: true,
  },
  {
    id: "excel",
    label: "Excel Workbook",
    description: "A single .xlsx workbook file as the store.",
    icon: FileSpreadsheet,
    needsFile: true,
    warn: "Excel mode is for small / single-user pharmacies only. It is NOT safe for concurrent, multi-user production use.",
  },
  {
    id: "hybrid",
    label: "Hybrid",
    description: "Local SQLite for immediate offline operation, automatically synced to Supabase when online.",
    icon: GitMerge,
    needsFile: true,
  },
];

export function StorageSetupWizard() {
  const [mode, setMode] = useState<Mode>("supabase");
  const [storageFile, setStorageFile] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/datahub/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (json.error) throw new Error(json.error);
        setMode(json.data.storage_mode || "supabase");
        setStorageFile(json.data.storage_file || "");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const active = MODES.find((m) => m.id === mode);

  const save = async () => {
    if (active?.needsFile && !storageFile.trim()) {
      toast.error("Enter a file path for the local store.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/datahub/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage_mode: mode,
          storage_file: active?.needsFile ? storageFile.trim() : "",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setMode(json.data.storage_mode);
      setStorageFile(json.data.storage_file || "");
      toast.success("Storage mode saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading storage configuration…
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-bold">Storage mode</h2>
        <p className="text-sm text-muted-foreground">
          Choose how this pharmacy stores its data. All modes are exposed through
          the same provider abstraction — switching does not change the UI.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-2xl border p-4 text-left transition ${
              mode === m.id
                ? "border-primary-600 bg-primary-50 dark:bg-primary-950"
                : "border-border hover:bg-muted"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              <m.icon className="h-5 w-5 text-primary-600" />
              {m.label}
              {mode === m.id && <Check className="ml-auto h-4 w-4 text-primary-600" />}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
          </button>
        ))}
      </div>

      {active?.warn && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {active.warn}
        </div>
      )}

      {active?.needsFile && (
        <Card>
          <CardContent className="p-5">
            <label className="mb-1.5 block text-xs font-medium">
              Store file path{" "}
              <span className="text-muted-foreground">
                ({mode === "excel" ? ".xlsx workbook" : "SQLite database"})
              </span>
            </label>
            <Input
              value={storageFile}
              onChange={(e) => setStorageFile(e.target.value)}
              placeholder={
                mode === "excel"
                  ? "/path/to/pharmacy.xlsx"
                  : "/path/to/pharmacy.sqlite"
              }
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              This path is resolved on the server. Leave blank for an in-memory /
              auto path in development.
            </p>
          </CardContent>
        </Card>
      )}

      <Button onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save storage mode
      </Button>
    </div>
  );
}
