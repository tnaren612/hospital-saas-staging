"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus,
  Loader2,
  CheckCircle2,
  Send,
} from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { hmsGet, hmsMutate } from "@/lib/hms/client-api";
import { formatCurrency } from "@/lib/utils";
import type { PreAuthorization, PatientInsurance } from "@/lib/insurance/types";

const statusColor: Record<string, "warning" | "success" | "danger" | "secondary" | "outline" | "default"> = {
  draft: "secondary",
  submitted: "warning",
  approved: "success",
  partially_approved: "warning",
  rejected: "danger",
  cancelled: "outline",
};

export function PreAuthorizationManager() {
  const [items, setItems] = useState<PreAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [patients, setPatients] = useState<{ id: string; full_name: string }[]>([]);
  const [policies, setPolicies] = useState<PatientInsurance[]>([]);

  const [form, setForm] = useState({
    patient_id: "",
    patient_insurance_id: "",
    treatment_type: "",
    diagnosis_code: "",
    estimated_amount: "",
    clinical_notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hmsGet<{ data: PreAuthorization[] }>(
        "/api/admin/insurance/pre-authorizations"
      );
      setItems(res.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = async () => {
    setCreateOpen(true);
    try {
      const [patientsRes, policiesRes] = await Promise.all([
        hmsGet<{ data: { id: string; full_name: string }[] }>(
          "/api/admin/patients?status=active"
        ),
        hmsGet<{ data: PatientInsurance[] }>(
          "/api/admin/insurance/patient-insurance?active=true"
        ),
      ]);
      setPatients(patientsRes.data || []);
      setPolicies(policiesRes.data || []);
    } catch {
      // non-fatal
    }
  };

  const createPreAuth = async () => {
    if (!form.patient_id || !form.patient_insurance_id || !form.treatment_type || !form.estimated_amount) {
      toast.error("Please fill required fields");
      return;
    }
    setSaving(true);
    try {
      await hmsMutate("/api/admin/insurance/pre-authorizations", "POST", {
        patient_id: form.patient_id,
        patient_insurance_id: form.patient_insurance_id,
        treatment_type: form.treatment_type,
        diagnosis_code: form.diagnosis_code || null,
        estimated_amount: Number(form.estimated_amount),
        clinical_notes: form.clinical_notes || null,
      });
      toast.success("Pre-authorization created");
      setCreateOpen(false);
      setForm({
        patient_id: "",
        patient_insurance_id: "",
        treatment_type: "",
        diagnosis_code: "",
        estimated_amount: "",
        clinical_notes: "",
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const submitPreAuth = async (id: string) => {
    try {
      await hmsMutate(`/api/admin/insurance/pre-authorizations/${id}`, "PATCH", {
        status: "submitted",
      });
      toast.success("Submitted for approval");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pre-Authorizations"
        description="Manage treatment pre-authorization requests"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <Button size="sm" onClick={() => void openCreate()}>
            <Plus className="mr-1.5 h-4 w-4" /> New Pre-Auth
          </Button>
        }
      />

      {createOpen && (
        <Card>
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            <div>
              <Label className="mb-2 block">Patient *</Label>
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={form.patient_id}
                onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
              >
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-2 block">Insurance Policy *</Label>
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={form.patient_insurance_id}
                onChange={(e) =>
                  setForm({ ...form, patient_insurance_id: e.target.value })
                }
              >
                <option value="">Select policy…</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.provider_name || "—"} · {p.policy_number}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-2 block">Treatment Type *</Label>
              <Input
                value={form.treatment_type}
                onChange={(e) =>
                  setForm({ ...form, treatment_type: e.target.value })
                }
                placeholder="e.g. Knee Replacement"
              />
            </div>
            <div>
              <Label className="mb-2 block">Diagnosis Code</Label>
              <Input
                value={form.diagnosis_code}
                onChange={(e) =>
                  setForm({ ...form, diagnosis_code: e.target.value })
                }
                placeholder="ICD-10 code"
              />
            </div>
            <div>
              <Label className="mb-2 block">Estimated Amount (₹) *</Label>
              <Input
                type="number"
                value={form.estimated_amount}
                onChange={(e) =>
                  setForm({ ...form, estimated_amount: e.target.value })
                }
                placeholder="0.00"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block">Clinical Notes</Label>
              <Textarea
                value={form.clinical_notes}
                onChange={(e) =>
                  setForm({ ...form, clinical_notes: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button onClick={() => void createPreAuth()} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Create
              </Button>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Auth #</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Treatment</th>
                  <th className="px-4 py-3">Est. Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No pre-authorizations found.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">
                        {item.authorization_number || "Draft"}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {item.patient_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.treatment_type}
                      </td>
                      <td className="px-4 py-3">
                        {formatCurrency(item.estimated_amount)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusColor[item.status] || "secondary"}>
                          {item.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {item.status === "draft" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void submitPreAuth(item.id)}
                              title="Submit"
                            >
                              <Send className="h-3.5 w-3.5 text-blue-500" />
                            </Button>
                          )}
                          {item.status === "submitted" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                /* TODO: approve flow */
                              }}
                              title="Review"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            </Button>
                          )}
                        </div>
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
