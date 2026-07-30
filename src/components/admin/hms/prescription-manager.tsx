"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FilePlus2, Loader2, Printer, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Prescription, RxMedicine } from "@/lib/phase2/types";
import { escapeHtml } from "@/lib/hms/export";
import { useHospitalConfig } from "@/components/hospital/hospital-config-provider";

const emptyMed = (): RxMedicine => ({
  name: "",
  dosage: "",
  morning: true,
  afternoon: false,
  night: true,
  food_instruction: "After food",
  duration: "5 days",
});

export function PrescriptionManager() {
  const { config } = useHospitalConfig();
  const [list, setList] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    patient_name: "",
    patient_phone: "",
    patient_age: "",
    doctor_name: "",
    diagnosis: "",
    notes: "",
    follow_up_date: "",
    medicines: [emptyMed()],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/phase2/prescriptions", { cache: "no-store" });
      const json = await res.json();
      setList(json.data || []);
    } catch {
      toast.error("Failed to load prescriptions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/phase2/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          patient_age: form.patient_age ? Number(form.patient_age) : null,
          medicines: form.medicines.filter((m) => m.name.trim()),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.success(`Prescription ${json.data.prescription_number} saved`);
      setForm((f) => ({
        ...f,
        patient_name: "",
        patient_phone: "",
        diagnosis: "",
        notes: "",
        medicines: [emptyMed()],
      }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const printRx = (rx: Prescription) => {
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    const safe = escapeHtml;
    const rows = rx.medicines
      .map(
        (m, i) =>
          `<tr><td>${i + 1}</td><td>${safe(m.name)}</td><td>${safe(
            m.dosage
          )}</td><td>${[
            m.morning ? "M" : "",
            m.afternoon ? "A" : "",
            m.night ? "N" : "",
          ]
            .filter(Boolean)
            .join("-")}</td><td>${safe(m.food_instruction)}</td><td>${safe(
            m.duration
          )}</td></tr>`
      )
      .join("");
    win.document.write(`<!doctype html><html><head><title>${safe(
      rx.prescription_number
    )}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#111}
        h1{font-size:18px;margin:0} h2{font-size:14px;color:#444;margin:4px 0 16px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        th,td{border:1px solid #ddd;padding:8px;text-align:left}
        .meta{font-size:13px;line-height:1.5}
        .foot{margin-top:40px;font-size:12px;color:#666}
      </style></head><body>
      <h1>${safe(config.templates.pdf_header || config.branding.name)}</h1>
      <h2>Digital Prescription</h2>
      <div class="meta">
        <div><b>Rx #</b> ${safe(rx.prescription_number)}</div>
        <div><b>Patient</b> ${safe(rx.patient_name)} · ${safe(
          rx.patient_phone
        )}</div>
        <div><b>Doctor</b> ${safe(rx.doctor_name)}</div>
        <div><b>Diagnosis</b> ${safe(rx.diagnosis)}</div>
        <div><b>Date</b> ${new Date(rx.created_at).toLocaleString()}</div>
      </div>
      <table><thead><tr><th>#</th><th>Medicine</th><th>Dosage</th><th>M-A-N</th><th>Food</th><th>Duration</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="meta"><b>Notes:</b> ${safe(rx.notes || "—")}</p>
      <p class="meta"><b>Follow-up:</b> ${safe(
        rx.follow_up_date || "—"
      )}</p>
      <div class="foot">${safe(config.templates.prescription_note || "This is a computer-generated prescription.")}</div>
      <script>window.print()</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Digital Prescriptions"
        description="Create, print, and track prescriptions"
        actions={
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-5">
          <h3 className="font-semibold">New prescription</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Patient name</Label>
              <Input className="mt-1" value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input className="mt-1" value={form.patient_phone} onChange={(e) => setForm({ ...form, patient_phone: e.target.value })} />
            </div>
            <div>
              <Label>Age</Label>
              <Input className="mt-1" value={form.patient_age} onChange={(e) => setForm({ ...form, patient_age: e.target.value })} />
            </div>
            <div>
              <Label>Doctor</Label>
              <Input className="mt-1" value={form.doctor_name} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Diagnosis</Label>
              <Input className="mt-1" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea className="mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div>
              <Label>Follow-up date</Label>
              <Input type="date" className="mt-1" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
            </div>
          </div>

          {form.medicines.map((m, idx) => (
            <div key={idx} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-6">
              <Input className="sm:col-span-2" placeholder="Medicine" value={m.name} onChange={(e) => {
                const medicines = [...form.medicines];
                medicines[idx] = { ...m, name: e.target.value };
                setForm({ ...form, medicines });
              }} />
              <Input placeholder="Dosage" value={m.dosage} onChange={(e) => {
                const medicines = [...form.medicines];
                medicines[idx] = { ...m, dosage: e.target.value };
                setForm({ ...form, medicines });
              }} />
              <Input placeholder="Duration" value={m.duration} onChange={(e) => {
                const medicines = [...form.medicines];
                medicines[idx] = { ...m, duration: e.target.value };
                setForm({ ...form, medicines });
              }} />
              <Input placeholder="Food instruction" value={m.food_instruction} onChange={(e) => {
                const medicines = [...form.medicines];
                medicines[idx] = { ...m, food_instruction: e.target.value };
                setForm({ ...form, medicines });
              }} />
              <div className="flex items-center gap-2 text-xs">
                {(["morning", "afternoon", "night"] as const).map((k) => (
                  <label key={k} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={m[k]}
                      onChange={(e) => {
                        const medicines = [...form.medicines];
                        medicines[idx] = { ...m, [k]: e.target.checked };
                        setForm({ ...form, medicines });
                      }}
                    />
                    {k[0].toUpperCase()}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, medicines: [...form.medicines, emptyMed()] })}>
              Add medicine
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
              Save prescription
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h3 className="font-semibold">History</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No prescriptions yet.</p>
          ) : (
            list.map((rx) => (
              <div key={rx.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                <div>
                  <p className="font-medium">{rx.prescription_number} · {rx.patient_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {rx.diagnosis} · {rx.medicines.length} meds · {new Date(rx.created_at).toLocaleString()}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => printRx(rx)}>
                  <Printer className="h-4 w-4" /> Print / PDF
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
