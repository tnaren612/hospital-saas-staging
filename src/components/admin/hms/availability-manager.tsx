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
  const [form, setForm] = useState({
    doctor_id: "",
    date: "",
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
      toast.error("Doctor and date required");
      return;
    }
    setSaving(true);
    try {
      await hmsMutate("/api/admin/availability", "POST", form);
      toast.success("Availability saved");
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
        description="Mark Available, On Leave, Holiday, or Emergency days"
        onRefresh={() => void load()}
        loading={loading}
      />

      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-4">
          <div>
            <Label className="mb-2 block">Doctor</Label>
            <select
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
            <Label className="mb-2 block">Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-2 block">Status</Label>
            <select
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
            <Label className="mb-2 block">Note</Label>
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div className="md:col-span-4">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save status
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
