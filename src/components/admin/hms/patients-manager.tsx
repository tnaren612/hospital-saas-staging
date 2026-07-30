"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Loader2, Search, User } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { TableSkeleton } from "@/components/admin/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { hmsGet, hmsMutate } from "@/lib/hms/client-api";
import type { HospitalPatient } from "@/lib/hms/types";
import type { Appointment } from "@/types";
import { formatDate } from "@/lib/utils";

type PatientRow = HospitalPatient & { appointment_count?: number };

const empty = {
  full_name: "",
  phone: "",
  email: "",
  age: "",
  gender: "" as "" | "male" | "female" | "other",
  address: "",
  medical_history: "",
  allergies: "",
  blood_group: "",
  emergency_contact: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  notes: "",
  status: "active" as "active" | "inactive",
};

export function PatientsManager() {
  const [items, setItems] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<
    (PatientRow & { appointments?: Appointment[] }) | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (statusFilter) params.status = statusFilter;
      const res = await hmsGet<{ data: PatientRow[] }>(
        "/api/admin/patients",
        params
      );
      setItems(res.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name,
        phone: form.phone,
        email: form.email || null,
        age: form.age ? Number(form.age) : null,
        gender: form.gender || null,
        address: form.address,
        medical_history: form.medical_history,
        allergies: form.allergies,
        blood_group: form.blood_group || null,
        emergency_contact: form.emergency_contact || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        notes: form.notes,
        status: form.status,
      };
      if (editingId) {
        await hmsMutate(`/api/admin/patients/${editingId}`, "PATCH", payload);
        toast.success("Patient updated");
      } else {
        await hmsMutate("/api/admin/patients", "POST", payload);
        toast.success("Patient created");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id: string) => {
    try {
      const res = await hmsGet<{
        data: PatientRow & { appointments: Appointment[] };
      }>(`/api/admin/patients/${id}`);
      setDetail(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load profile");
    }
  };

  const remove = async (id: string) => {
    if (
      !confirm(
        "Remove this patient from the active registry? (Soft delete — PHI history retained.)"
      )
    )
      return;
    try {
      await hmsMutate(`/api/admin/patients/${id}`, "DELETE");
      toast.success("Patient removed from registry");
      setDetail(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patient Management"
        description="Registry, medical history, and appointment history"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setForm(empty);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Patient
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search name, phone, email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search patients"
          />
        </div>
        <div>
          <Label htmlFor="patient-status" className="mb-1 block text-xs">
            Status
          </Label>
          <select
            id="patient-status"
            className="flex h-11 min-w-[120px] rounded-xl border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {open && (
        <Card>
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            <div>
              <Label className="mb-2 block">Full name</Label>
              <Input
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="mb-2 block">Phone</Label>
              <Input
                value={form.phone}
                maxLength={10}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-2 block">Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-2 block">Age</Label>
                <Input
                  type="number"
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">Gender</Label>
                <select
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={form.gender}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      gender: e.target.value as typeof form.gender,
                    })
                  }
                >
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block">Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block">Medical history</Label>
              <Textarea
                value={form.medical_history}
                onChange={(e) =>
                  setForm({ ...form, medical_history: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block">Allergies</Label>
              <Textarea
                value={form.allergies}
                onChange={(e) =>
                  setForm({ ...form, allergies: e.target.value })
                }
                placeholder="Drug / food allergies…"
                className="min-h-[72px]"
              />
            </div>
            <div>
              <Label className="mb-2 block">Blood group</Label>
              <Input
                value={form.blood_group}
                onChange={(e) =>
                  setForm({ ...form, blood_group: e.target.value })
                }
                placeholder="e.g. B+"
              />
            </div>
            <div>
              <Label className="mb-2 block">Emergency contact (legacy)</Label>
              <Input
                value={form.emergency_contact}
                onChange={(e) =>
                  setForm({ ...form, emergency_contact: e.target.value })
                }
                placeholder="Optional free text"
              />
            </div>
            <div>
              <Label className="mb-2 block">Emergency contact name</Label>
              <Input
                value={form.emergency_contact_name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    emergency_contact_name: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label className="mb-2 block">Emergency contact phone</Label>
              <Input
                value={form.emergency_contact_phone}
                maxLength={10}
                inputMode="numeric"
                onChange={(e) =>
                  setForm({
                    ...form,
                    emergency_contact_phone: e.target.value,
                  })
                }
                placeholder="10-digit mobile"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Patient</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Visits</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-4 py-3 font-medium">{p.full_name}</td>
                        <td className="px-4 py-3">
                          <div>{p.phone}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.email || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {p.appointment_count ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void openDetail(p.id)}
                            >
                              <User className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(p.id);
                                setForm({
                                  full_name: p.full_name,
                                  phone: p.phone,
                                  email: p.email || "",
                                  age: p.age != null ? String(p.age) : "",
                                  gender: p.gender || "",
                                  address: p.address || "",
                                  medical_history: p.medical_history || "",
                                  allergies: p.allergies || "",
                                  blood_group: p.blood_group || "",
                                  emergency_contact: p.emergency_contact || "",
                                  emergency_contact_name:
                                    p.emergency_contact_name || "",
                                  emergency_contact_phone:
                                    p.emergency_contact_phone || "",
                                  notes: p.notes || "",
                                  status: p.status,
                                });
                                setOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void remove(p.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            {!detail ? (
              <p className="text-sm text-muted-foreground">
                Select a patient profile to view medical & appointment history.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">{detail.full_name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {detail.phone} · {detail.email || "no email"}
                  </p>
                  <Badge className="mt-2" variant="teal">
                    {detail.status}
                  </Badge>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Medical history</h3>
                  <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                    {detail.medical_history || "—"}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Contact</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detail.address || "—"}
                    <br />
                    Emergency: {detail.emergency_contact || "—"}
                    <br />
                    Blood: {detail.blood_group || "—"}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">
                    Appointment history
                  </h3>
                  <ul className="max-h-64 space-y-2 overflow-y-auto">
                    {(detail.appointments || []).length === 0 ? (
                      <li className="text-sm text-muted-foreground">
                        No appointments for this phone.
                      </li>
                    ) : (
                      detail.appointments!.map((a) => (
                        <li
                          key={a.id}
                          className="rounded-xl border border-border p-3 text-xs"
                        >
                          <div className="font-medium">
                            {formatDate(a.date)} · {a.timeSlot}
                          </div>
                          <div className="text-muted-foreground">
                            {a.doctorName} · {a.status}
                          </div>
                          <div className="mt-1">{a.problem}</div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
