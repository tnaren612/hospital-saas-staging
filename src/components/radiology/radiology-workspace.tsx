"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Patient = { id: string; full_name: string; phone: string };
type Study = {
  id: string; study_number: string; modality: string; body_part: string; priority: string;
  status: string; scheduled_at: string | null; findings: string | null; impression: string | null;
  hospital_patients?: { full_name: string; phone: string };
  radiology_attachments?: {id:string;file_name:string;file_url:string;attachment_type:string}[];
};
type Summary = { ordered: number; scheduled: number; active: number; reported: number };

const initialOrder = {
  patient_id: "", modality: "xray", body_part: "", clinical_indication: "", priority: "routine",
};

export function RadiologyWorkspace() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [studies, setStudies] = useState<Study[]>([]);
  const [summary, setSummary] = useState<Summary>({ ordered: 0, scheduled: 0, active: 0, reported: 0 });
  const [order, setOrder] = useState(initialOrder);
  const [schedule, setSchedule] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Record<string, { findings: string; impression: string; recommendations: string }>>({});
  const [attachments,setAttachments]=useState<Record<string,{name:string;url:string}>>({});

  const load = useCallback(async () => {
    const [patientResponse, studyResponse] = await Promise.all([
      fetch("/api/admin/patients"), fetch("/api/radiology"),
    ]);
    const patientJson = await patientResponse.json();
    const studyJson = await studyResponse.json();
    if (patientResponse.ok) setPatients(patientJson.data || []);
    if (studyResponse.ok) {
      setStudies(studyJson.data.studies || []);
      setSummary(studyJson.data.summary);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const createOrder = async () => {
    const response = await fetch("/api/radiology", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order),
    });
    const json = await response.json();
    if (!response.ok) return toast.error(json.error || "Order failed");
    toast.success("Radiology study ordered");
    setOrder(initialOrder);
    await load();
  };
  const update = async (id: string, body: Record<string, unknown>, message: string) => {
    const response = await fetch(`/api/radiology/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) return toast.error(json.error || "Update failed");
    toast.success(message);
    await load();
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Radiology</h1><p className="text-sm text-muted-foreground">Orders, scheduling, imaging workflow, reports and audit history.</p></div>
      <Button variant="outline" asChild><a href="/api/radiology/report">Export radiology CSV</a></Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-4">
      {Object.entries(summary).map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}
    </div>
    <Card><CardContent className="grid gap-4 p-5 md:grid-cols-2">
      <div><Label>Patient</Label><select aria-label="Radiology patient" className="mt-1 h-11 w-full rounded-xl border bg-background px-3" value={order.patient_id} onChange={(event) => setOrder({ ...order, patient_id: event.target.value })}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.phone}</option>)}</select></div>
      <div><Label>Modality</Label><select aria-label="Radiology modality" className="mt-1 h-11 w-full rounded-xl border bg-background px-3" value={order.modality} onChange={(event) => setOrder({ ...order, modality: event.target.value })}>{["xray","ct","mri","ultrasound","mammography","fluoroscopy","other"].map((item) => <option key={item}>{item}</option>)}</select></div>
      <div><Label>Body part</Label><Input aria-label="Body part" value={order.body_part} onChange={(event) => setOrder({ ...order, body_part: event.target.value })} /></div>
      <div><Label>Priority</Label><select aria-label="Radiology priority" className="mt-1 h-11 w-full rounded-xl border bg-background px-3" value={order.priority} onChange={(event) => setOrder({ ...order, priority: event.target.value })}>{["routine","urgent","stat"].map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="md:col-span-2"><Label>Clinical indication</Label><Textarea aria-label="Clinical indication" value={order.clinical_indication} onChange={(event) => setOrder({ ...order, clinical_indication: event.target.value })} /></div>
      <Button onClick={() => void createOrder()} disabled={!order.patient_id || !order.body_part || !order.clinical_indication}>Create radiology order</Button>
    </CardContent></Card>
    <div className="space-y-3">{studies.map((study) => <Card key={study.id}><CardContent className="space-y-4 p-5">
      <div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold">{study.study_number} · {study.hospital_patients?.full_name}</p><p className="text-sm text-muted-foreground">{study.modality.toUpperCase()} · {study.body_part} · {study.priority} · {study.status}</p></div></div>
      {study.status === "ordered" && <div className="flex flex-wrap gap-2"><Input aria-label={`Schedule ${study.study_number}`} type="datetime-local" className="max-w-xs" value={schedule[study.id] || ""} onChange={(event) => setSchedule({ ...schedule, [study.id]: event.target.value })}/><Button onClick={() => void update(study.id, { action: "schedule", scheduled_at: new Date(schedule[study.id]).toISOString() }, "Study scheduled")} disabled={!schedule[study.id]}>Schedule</Button></div>}
      {study.status === "scheduled" && <Button onClick={() => void update(study.id, { action: "set_status", status: "checked_in" }, "Patient checked in")}>Check in</Button>}
      {study.status === "checked_in" && <Button onClick={() => void update(study.id, { action: "set_status", status: "in_progress" }, "Imaging started")}>Start imaging</Button>}
      {study.status === "in_progress" && <Button onClick={() => void update(study.id, { action: "set_status", status: "completed" }, "Imaging completed")}>Complete imaging</Button>}
      {study.status === "completed" && <div className="grid gap-3 md:grid-cols-2">
        <Textarea aria-label={`Findings ${study.study_number}`} placeholder="Findings" value={reports[study.id]?.findings || ""} onChange={(event) => setReports({ ...reports, [study.id]: { findings: event.target.value, impression: reports[study.id]?.impression || "", recommendations: reports[study.id]?.recommendations || "" } })}/>
        <Textarea aria-label={`Impression ${study.study_number}`} placeholder="Impression" value={reports[study.id]?.impression || ""} onChange={(event) => setReports({ ...reports, [study.id]: { findings: reports[study.id]?.findings || "", impression: event.target.value, recommendations: reports[study.id]?.recommendations || "" } })}/>
        <Textarea aria-label={`Recommendations ${study.study_number}`} placeholder="Recommendations" value={reports[study.id]?.recommendations || ""} onChange={(event) => setReports({ ...reports, [study.id]: { findings: reports[study.id]?.findings || "", impression: reports[study.id]?.impression || "", recommendations: event.target.value } })}/>
        <Button onClick={() => void update(study.id, { action: "report", ...reports[study.id] }, "Report finalized")} disabled={!reports[study.id]?.findings || !reports[study.id]?.impression}>Finalize report</Button>
      </div>}
      {study.status === "reported" && <div className="rounded-xl bg-muted p-3"><p className="font-medium">Impression</p><p className="text-sm">{study.impression}</p></div>}
      <div className="grid gap-2 rounded-xl border p-3 md:grid-cols-3"><Input aria-label={`Attachment name ${study.study_number}`} placeholder="Attachment name" value={attachments[study.id]?.name||""} onChange={e=>setAttachments({...attachments,[study.id]:{name:e.target.value,url:attachments[study.id]?.url||""}})}/><Input aria-label={`Attachment URL ${study.study_number}`} placeholder="Secure attachment URL" value={attachments[study.id]?.url||""} onChange={e=>setAttachments({...attachments,[study.id]:{name:attachments[study.id]?.name||"",url:e.target.value}})}/><Button disabled={!attachments[study.id]?.name||!attachments[study.id]?.url} onClick={()=>void update(study.id,{action:"attachment",attachment_type:"other",file_name:attachments[study.id]?.name,file_url:attachments[study.id]?.url,mime_type:"application/octet-stream"},"Attachment added")}>Add attachment</Button><div className="md:col-span-3 flex flex-wrap gap-2">{(study.radiology_attachments||[]).map(a=><a key={a.id} className="text-sm text-primary underline" href={a.file_url} target="_blank" rel="noreferrer">{a.file_name}</a>)}</div></div>
    </CardContent></Card>)}</div>
  </div>;
}
