"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { PatientShell } from "@/components/patient/patient-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PatientReport } from "@/lib/patient/types";
import { getDemoDashboard } from "@/lib/patient/service";

export function PatientReportsPage() {
  const [items, setItems] = useState<PatientReport[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const name = getDemoDashboard().patient?.full_name;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/patient/reports", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setItems(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const n = q.toLowerCase();
    return items.filter(
      (r) =>
        r.title.toLowerCase().includes(n) ||
        r.report_type.toLowerCase().includes(n) ||
        (r.doctor_id || "").toLowerCase().includes(n)
    );
  }, [items, q]);

  return (
    <PatientShell patientName={name}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My reports</h1>
          <p className="text-sm text-muted-foreground">
            Clinical reports uploaded by the hospital team
          </p>
        </div>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search reports…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search reports"
          />
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No reports yet. When the hospital uploads results, they appear
              here.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div>
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.report_type} ·{" "}
                      {new Date(r.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                  <a
                    href={r.report_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" variant="outline">
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PatientShell>
  );
}
