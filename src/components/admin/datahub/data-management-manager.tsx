"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Database,
  Upload,
  Download,
  FileSpreadsheet,
  ArrowRightLeft,
  Archive,
  History,
  HardDrive,
  Loader2,
} from "lucide-react";
import { DatabaseBrowser } from "./database-browser";
import { ImportWizard } from "./import-wizard";
import { ExportPanel } from "./export-panel";
import { TemplatesPanel } from "./templates-panel";
import { MappingManager } from "./mapping-manager";
import { BackupManager } from "./backup-manager";
import { AuditLog } from "./audit-log";
import { StorageSetupWizard } from "./storage-setup-wizard";

export type CatalogModule = {
  key: string;
  label: string;
  description: string;
  source: "db" | "config";
  table: string;
  titleField?: string;
  fieldCount: number;
  uniqueKeys: string[];
  relationships: { module: string; field: string }[];
  count: number;
};

export type CatalogStats = {
  modules: number;
  tables: number;
  totalRecords: number;
};

type Tab =
  | "database"
  | "import"
  | "export"
  | "templates"
  | "mapping"
  | "backup"
  | "audit"
  | "storage";

const TABS: { id: Tab; label: string; icon: typeof Database }[] = [
  { id: "database", label: "Database", icon: Database },
  { id: "import", label: "Import", icon: Upload },
  { id: "export", label: "Export", icon: Download },
  { id: "templates", label: "Templates", icon: FileSpreadsheet },
  { id: "mapping", label: "Mapping", icon: ArrowRightLeft },
  { id: "backup", label: "Backup & Restore", icon: Archive },
  { id: "audit", label: "Audit Log", icon: History },
  { id: "storage", label: "Storage", icon: HardDrive },
];

export function DataManagementManager({
  email,
  userId,
}: {
  email: string | null;
  userId: string | null;
}) {
  const [tab, setTab] = useState<Tab>("database");
  const [modules, setModules] = useState<CatalogModule[]>([]);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/datahub", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (json.error) throw new Error(json.error);
        setModules(json.data.modules);
        setStats(json.data.stats);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Database className="h-6 w-6 text-primary-600" />
          Data Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse, import, export and back up your hospital data — fully
          configurable from Admin → Settings.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-1 rounded-xl bg-muted p-1"
        role="tablist"
        aria-label="Data management sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm ${
              tab === t.id ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading data catalog…
        </div>
      ) : (
        <div className="min-w-0">
          {tab === "database" && (
            <DatabaseBrowser modules={modules} stats={stats} />
          )}
          {tab === "import" && <ImportWizard modules={modules} />}
          {tab === "export" && <ExportPanel modules={modules} />}
          {tab === "templates" && <TemplatesPanel modules={modules} />}
          {tab === "mapping" && (
            <MappingManager modules={modules} actorEmail={email} actorId={userId} />
          )}
          {tab === "backup" && <BackupManager />}
          {tab === "audit" && <AuditLog />}
          {tab === "storage" && <StorageSetupWizard />}
        </div>
      )}
    </div>
  );
}
