"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { hmsGet, hmsMutate } from "@/lib/hms/client-api";
import {
  AVAILABILITY_OPTIONS,
  type AvailabilityStatus,
  type DoctorAvailability,
  type HospitalDoctor,
} from "@/lib/hms/types";
import { formatDate } from "@/lib/utils";

export function AvailabilityManager() {
  const [doctors, setDoctors] = useState<HospitalDoctor[]>([]);
  const [rows, setRows] = useState<DoctorAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [form, setForm] = useState({
    doctor_id: "",
    date: "",
    date_to: "",
    status: "on_leave" as AvailabilityStatus,
    note: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
      const [docs, avail] = await Promise.all([
        hmsGet<{ data: HospitalDoctor[] }>("/api/admin/doctors"),
        hmsGet<{ data: DoctorAvailability[] }>("/api/admin/availability", {
          from,
          to,
        }),
      ]);
      setDoctors(docs.data || []);
      setRows(avail.data || []);
      if (!form.doctor_id && docs.data?.[0]?.id) {
        setForm((f) => ({ ...f, doctor_id: docs.data[0].id }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [form.doctor_id]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!form.doctor_id || !form.date) {
      toast.error("Doctor and start date required");
      return;
    }
    if (bulkMode && !form.date_to) {
      toast.error("End date required for date range");
      return;
    }
    setSaving(true);
    try {
      if (bulkMode) {
        const res = await hmsMutate<{ count?: number }>(
          "/api/admin/availability",
          "POST",
          {
            doctor_id: form.doctor_id,
            from: form.date,
            to: form.date_to,
            status: form.status,
            note: form.note,
          }
        );
        toast.success(`Saved ${res.count ?? "range"} day(s)`);
      } else {
        await hmsMutate("/api/admin/availability", "POST", {
          doctor_id: form.doctor_id,
          date: form.date,
          status: form.status,
          note: form.note,
        });
        toast.success("Availability saved");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await hmsMutate(`/api/admin/availability/${id}`, "DELETE");
      toast.success("Removed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const badgeVariant = (s: string) => {
    if (s === "available") return "success" as const;
    if (s === "emergency") return "danger" as const;
    if (s === "holiday") return "warning" as const;
    return "secondary" as const;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctor Availability"
        description="Mark Available, On Leave, Holiday, or Emergency — single day or date range (max 90 days)"
        onRefresh={() => void load()}
        loading={loading}
      />

      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <Label htmlFor="avail-doctor" className="mb-2 block">
              Doctor
            </Label>
            <select
              id="avail-doctor"
              className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={form.doctor_id}
              onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}
            >
              <option value="">Select…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="avail-from" className="mb-2 block">
              {bulkMode ? "From date" : "Date"}
            </Label>
            <Input
              id="avail-from"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          {bulkMode && (
            <div>
              <Label htmlFor="avail-to" className="mb-2 block">
                To date
              </Label>
              <Input
                id="avail-to"
                type="date"
                value={form.date_to}
                onChange={(e) => setForm({ ...form, date_to: e.target.value })}
              />
            </div>
          )}
          <div>
            <Label htmlFor="avail-status" className="mb-2 block">
              Status
            </Label>
            <select
              id="avail-status"
              className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={form.status}
              onChange={(e) =>
                setForm({
                  ...form,
                  status: e.target.value as AvailabilityStatus,
                })
              }
            >
              {AVAILABILITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="avail-note" className="mb-2 block">
              Note
            </Label>
            <Input
              id="avail-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border"
                checked={bulkMode}
                onChange={(e) => setBulkMode(e.target.checked)}
              />
              Date range (bulk)
            </label>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {bulkMode ? "Save range" : "Save status"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No availability overrides in the next 60 days.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3">{formatDate(r.date)}</td>
                      <td className="px-4 py-3">
                        {(r as DoctorAvailability & { doctor?: { name: string } })
                          .doctor?.name || r.doctor_id}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={badgeVariant(r.status)}>
                          {r.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.note || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void remove(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
