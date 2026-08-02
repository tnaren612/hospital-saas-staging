"use client";

import { FileSpreadsheet, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CatalogModule } from "./data-management-manager";

export function TemplatesPanel({ modules }: { modules: CatalogModule[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Download an .xlsx template for each module — includes a sample row and
        a Validation Rules sheet describing every field.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <Card key={m.key}>
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-semibold">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  {m.label}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {m.description}
                </p>
              </div>
              <a
                href={`/api/admin/datahub/${m.key}/template`}
                className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-input px-3 text-xs font-medium text-primary-600 hover:bg-muted"
              >
                Download
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
