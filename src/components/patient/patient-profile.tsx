"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { PatientShell } from "@/components/patient/patient-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { PortalPatient } from "@/lib/patient/types";
import { allowDemoFallback } from "@/lib/supabase/demo-gate";
import {
  getDemoDashboard,
  getPatientDashboard,
  updatePatientProfile,
} from "@/lib/patient/service";
import { createClientOrNull } from "@/lib/supabase/client";

export function PatientProfilePage() {
  const [patient, setPatient] = useState<PortalPatient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("demo");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPatientDashboard(createClientOrNull() || undefined);
      setPatient(data.patient);
      setMode(data.mode);
    } catch {
      if (allowDemoFallback()) {
        const demo = getDemoDashboard();
        setPatient(demo.patient);
        setMode(demo.mode);
      } else {
        setPatient(null);
        setMode("unauthenticated");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!patient) return;
    if (mode === "demo") {
      toast.error("Switch to Supabase patient login to save profile changes.");
      return;
    }
    setSaving(true);
    try {
      const result = await updatePatientProfile({
        first_name: patient.first_name,
        last_name: patient.last_name,
        phone: patient.phone || "",
        email: patient.email || "",
        gender: patient.gender,
        date_of_birth: patient.date_of_birth,
        blood_group: patient.blood_group,
        address: patient.address,
        emergency_contact: patient.emergency_contact,
        insurance_provider: patient.insurance_provider,
        insurance_number: patient.insurance_number,
        profile_photo: patient.profile_photo,
      });
      if (!result.ok || !result.patient) {
        throw new Error(result.error || "Save failed");
      }
      setPatient(result.patient);
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !patient) {
    return (
      <PatientShell>
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      </PatientShell>
    );
  }

  return (
    <PatientShell patientName={patient.full_name}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My profile</h1>
          <p className="text-sm text-muted-foreground">
            Personal details, insurance, emergency contact
            {patient.mrn ? ` · ${patient.mrn}` : ""}
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            <Field label="First name">
              <Input
                value={patient.first_name}
                onChange={(e) =>
                  setPatient({ ...patient, first_name: e.target.value })
                }
              />
            </Field>
            <Field label="Last name">
              <Input
                value={patient.last_name}
                onChange={(e) =>
                  setPatient({ ...patient, last_name: e.target.value })
                }
              />
            </Field>
            <Field label="Phone">
              <Input
                value={patient.phone || ""}
                onChange={(e) =>
                  setPatient({ ...patient, phone: e.target.value })
                }
              />
            </Field>
            <Field label="Email">
              <Input
                value={patient.email || ""}
                onChange={(e) =>
                  setPatient({ ...patient, email: e.target.value })
                }
              />
            </Field>
            <Field label="Gender">
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                value={patient.gender || ""}
                onChange={(e) =>
                  setPatient({
                    ...patient,
                    gender: (e.target.value || null) as PortalPatient["gender"],
                  })
                }
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Date of birth">
              <Input
                type="date"
                value={patient.date_of_birth || ""}
                onChange={(e) =>
                  setPatient({ ...patient, date_of_birth: e.target.value })
                }
              />
            </Field>
            <Field label="Blood group">
              <Input
                value={patient.blood_group || ""}
                onChange={(e) =>
                  setPatient({ ...patient, blood_group: e.target.value })
                }
                placeholder="e.g. O+"
              />
            </Field>
            <Field label="Emergency contact">
              <Input
                value={patient.emergency_contact || ""}
                onChange={(e) =>
                  setPatient({
                    ...patient,
                    emergency_contact: e.target.value,
                  })
                }
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Address">
                <Textarea
                  value={patient.address}
                  onChange={(e) =>
                    setPatient({ ...patient, address: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Insurance provider">
              <Input
                value={patient.insurance_provider || ""}
                onChange={(e) =>
                  setPatient({
                    ...patient,
                    insurance_provider: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Insurance number">
              <Input
                value={patient.insurance_number || ""}
                onChange={(e) =>
                  setPatient({
                    ...patient,
                    insurance_number: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Profile photo URL">
              <Input
                value={patient.profile_photo}
                onChange={(e) =>
                  setPatient({ ...patient, profile_photo: e.target.value })
                }
                placeholder="Upload via Gallery CMS or paste URL"
              />
            </Field>
            <div className="md:col-span-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Save profile
              </Button>
              {mode === "demo" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Demo OTP sessions cannot persist profile to Supabase. Register
                  with email under Patient Login for full portal.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PatientShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {children}
    </div>
  );
}
