"use client";

import { useEffect, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Prescription } from "@/lib/phase2/types";
import { useHospitalConfig } from "@/components/hospital/hospital-config-provider";

/**
 * Patient-facing prescription list.
 * Uses public list when authenticated staff API is unavailable — demo shows empty or local data via staff API is admin-only.
 * For production, wire patient phone match via dedicated patient API later.
 */
export function PatientPrescriptions() {
  const { config } = useHospitalConfig();
  const [items, setItems] = useState<Prescription[]>([]);
  const [note, setNote] = useState("Sign in or ask reception to share your Rx number.");

  useEffect(() => {
    // Best-effort: if demo session exists this may 401; show empty state
    void fetch("/api/phase2/prescriptions", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          setNote(
            "Prescriptions appear here after your doctor issues them. Contact reception with your phone number."
          );
          return;
        }
        const j = await r.json();
        setItems(j.data || []);
        setNote("");
      })
      .catch(() => {
        setNote("Unable to load prescriptions right now.");
      });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">My Prescriptions</h1>
        <p className="text-sm text-muted-foreground">
          View and print digital prescriptions from {config.branding.name}.
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 opacity-40" />
            {note || "No prescriptions found."}
          </CardContent>
        </Card>
      ) : (
        items.map((rx) => (
          <Card key={rx.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{rx.prescription_number}</p>
                <p className="text-sm text-muted-foreground">
                  {rx.doctor_name} · {rx.diagnosis}
                </p>
                <p className="text-xs text-muted-foreground">
                  {rx.medicines.length} medicines ·{" "}
                  {new Date(rx.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  window.print();
                }}
              >
                <Printer className="h-4 w-4" /> Print
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
