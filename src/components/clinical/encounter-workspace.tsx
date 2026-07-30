"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Patient = { id: string; full_name: string; phone: string };
type Encounter = {
  id: string; encounter_number: string; status: string; encounter_type: string;
  chief_complaint: string; assessment: string; plan: string; diagnoses: { description: string }[];
  observations: Record<string, number>; orders: { name: string; priority: string }[];
  created_at: string; hospital_patients?: { full_name: string };
};

export function EncounterWorkspace() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [form, setForm] = useState({ patient_id: "", chief_complaint: "", history: "", examination: "", assessment: "", plan: "", diagnosis: "", temperature: "", pulse: "", spo2: "", order: "" });

  const load = useCallback(async () => {
    const [p, e] = await Promise.all([fetch("/api/admin/patients"), fetch("/api/clinical/encounters")]);
    const pj = await p.json(); const ej = await e.json();
    if (p.ok) setPatients(pj.data || []);
    if (e.ok) setEncounters(ej.data || []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    const response = await fetch("/api/clinical/encounters", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: form.patient_id, encounter_type: "outpatient",
        chief_complaint: form.chief_complaint, history: form.history,
        examination: form.examination, assessment: form.assessment, plan: form.plan,
        diagnoses: form.diagnosis ? [{ description: form.diagnosis, system: "local", primary: true }] : [],
        observations: {
          ...(form.temperature ? { temperature_c: Number(form.temperature) } : {}),
          ...(form.pulse ? { pulse_bpm: Number(form.pulse) } : {}),
          ...(form.spo2 ? { spo2_percent: Number(form.spo2) } : {}),
        },
        orders: form.order ? [{ type: "other", name: form.order, priority: "routine" }] : [],
      }),
    });
    const json = await response.json();
    if (!response.ok) return toast.error(json.error || "Unable to create encounter");
    toast.success("Encounter started"); setForm({ patient_id: "", chief_complaint: "", history: "", examination: "", assessment: "", plan: "", diagnosis: "", temperature: "", pulse: "", spo2: "", order: "" }); await load();
  };

  const complete = async (id: string) => {
    const response = await fetch(`/api/clinical/encounters/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    if (!response.ok) return toast.error("Unable to complete encounter");
    toast.success("Encounter completed"); await load();
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Clinical Encounters</h1><p className="text-sm text-muted-foreground">Document vitals, diagnosis, clinical notes, orders and care plan.</p></div><Button variant="outline" asChild><a href="/api/clinical/encounters/report">Export clinical report</a></Button></div>
    <Card><CardContent className="grid gap-4 p-5 md:grid-cols-2">
      <div><Label>Patient</Label><select aria-label="Patient" className="mt-1 h-11 w-full rounded-xl border bg-background px-3" value={form.patient_id} onChange={e=>setForm({...form,patient_id:e.target.value})}><option value="">Select patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.full_name} · {p.phone}</option>)}</select></div>
      <div><Label>Chief complaint</Label><Input value={form.chief_complaint} onChange={e=>setForm({...form,chief_complaint:e.target.value})}/></div>
      {(["history","examination","assessment","plan"] as const).map(k=><div key={k}><Label className="capitalize">{k}</Label><Textarea value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></div>)}
      <div><Label>Primary diagnosis</Label><Input value={form.diagnosis} onChange={e=>setForm({...form,diagnosis:e.target.value})}/></div>
      <div><Label>Clinical order</Label><Input value={form.order} onChange={e=>setForm({...form,order:e.target.value})}/></div>
      <div className="grid grid-cols-3 gap-2"><Input aria-label="Temperature" placeholder="°C" value={form.temperature} onChange={e=>setForm({...form,temperature:e.target.value})}/><Input aria-label="Pulse" placeholder="Pulse" value={form.pulse} onChange={e=>setForm({...form,pulse:e.target.value})}/><Input aria-label="SpO2" placeholder="SpO₂" value={form.spo2} onChange={e=>setForm({...form,spo2:e.target.value})}/></div>
      <div className="md:col-span-2"><Button onClick={()=>void create()} disabled={!form.patient_id || !form.chief_complaint}>Start encounter</Button></div>
    </CardContent></Card>
    <div className="space-y-3">{encounters.map(e=><Card key={e.id}><CardContent className="p-5">
      <div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold">{e.encounter_number} · {e.hospital_patients?.full_name}</p><p className="text-sm text-muted-foreground">{new Date(e.created_at).toLocaleString()} · {e.status}</p></div>{e.status!=="completed"&&<Button size="sm" onClick={()=>void complete(e.id)}>Complete</Button>}</div>
      <p className="mt-3"><strong>Complaint:</strong> {e.chief_complaint}</p>
      {e.diagnoses?.length>0&&<p><strong>Diagnosis:</strong> {e.diagnoses.map(d=>d.description).join(", ")}</p>}
      {e.orders?.length>0&&<p><strong>Orders:</strong> {e.orders.map(o=>o.name).join(", ")}</p>}
      <p className="text-xs text-muted-foreground">Timeline: encounter created → {e.status}</p>
    </CardContent></Card>)}</div>
  </div>;
}
