"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  CalendarPlus,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { PatientShell } from "@/components/patient/patient-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import type { Appointment } from "@/types";
import {
  confirmationText,
  googleCalendarUrl,
  outlookCalendarUrl,
} from "@/lib/patient/service";
import { getDemoDashboard } from "@/lib/patient/service";

export function PatientAppointmentsPage() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState<Appointment | null>(null);
  const [rsDate, setRsDate] = useState("");
  const [rsTime, setRsTime] = useState("");
  const name = getDemoDashboard().patient?.full_name;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/patient/appointments", {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setItems(json.data || []);
      else {
        // demo fallback handled server-side mostly
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (id: string) => {
    if (!confirm("Cancel this appointment?")) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/patient/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "cancel" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Cancel failed");
      toast.success("Appointment cancelled");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusyId(null);
    }
  };

  const submitReschedule = async () => {
    if (!reschedule || !rsDate || !rsTime) return;
    setBusyId(reschedule.id);
    try {
      const res = await fetch("/api/patient/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: reschedule.id,
          action: "reschedule",
          date: rsDate,
          timeSlot: rsTime,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Reschedule failed");
      toast.success("Appointment rescheduled");
      setReschedule(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reschedule failed");
    } finally {
      setBusyId(null);
    }
  };

  const downloadConfirmation = (a: Appointment) => {
    const text = confirmationText(a);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `appointment-${a.bookingRef || a.id}.txt`;
    el.click();
    URL.revokeObjectURL(url);
    toast.success("Confirmation downloaded");
  };

  return (
    <PatientShell patientName={name}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">My appointments</h1>
            <p className="text-sm text-muted-foreground">
              Cancel, reschedule, download confirmation, add to calendar
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
            <Link href="/appointment">
              <Button size="sm">
                <CalendarPlus className="h-4 w-4" /> Book new
              </Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No appointments found for your account. Book one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{a.doctorName}</h2>
                      <Badge variant="outline" className="capitalize">
                        {a.status}
                      </Badge>
                      <Badge variant="secondary">{a.type}</Badge>
                      {a.paymentStatus && (
                        <Badge
                          variant={
                            a.paymentStatus === "paid" ||
                            a.paymentStatus === "paid_online" ||
                            a.paymentStatus === "paid_cash"
                              ? "success"
                              : a.paymentStatus === "failed"
                                ? "danger"
                                : "outline"
                          }
                          className="capitalize"
                        >
                          Pay: {a.paymentStatus.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(a.date)} · {a.timeSlot}
                      {a.departmentName ? ` · ${a.departmentName}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ref: {a.bookingRef || a.id}
                    </p>
                    <p className="mt-1 text-sm">{a.problem}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.status !== "cancelled" && a.status !== "completed" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === a.id}
                          onClick={() => {
                            setReschedule(a);
                            setRsDate(a.date);
                            setRsTime(a.timeSlot);
                          }}
                        >
                          Reschedule
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === a.id}
                          onClick={() => void cancel(a.id)}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                    {a.invoiceId && (
                      <a
                        href={`/api/invoices/${a.invoiceId}?format=pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" variant="outline">
                          <Download className="h-3.5 w-3.5" /> Invoice
                        </Button>
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadConfirmation(a)}
                    >
                      <Download className="h-3.5 w-3.5" /> Confirmation
                    </Button>
                    <a
                      href={googleCalendarUrl(a)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" variant="ghost">
                        Google Cal
                      </Button>
                    </a>
                    <a
                      href={outlookCalendarUrl(a)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" variant="ghost">
                        Outlook
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {reschedule && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <Card className="w-full max-w-md">
              <CardContent className="space-y-4 p-6">
                <h2 className="text-lg font-semibold">Reschedule</h2>
                <p className="text-sm text-muted-foreground">
                  {reschedule.doctorName} · current{" "}
                  {formatDate(reschedule.date)} {reschedule.timeSlot}
                </p>
                <div>
                  <Label className="mb-2 block">New date</Label>
                  <Input
                    type="date"
                    value={rsDate}
                    onChange={(e) => setRsDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">New time (e.g. 10:00 AM)</Label>
                  <Input
                    value={rsTime}
                    onChange={(e) => setRsTime(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setReschedule(null)}
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => void submitReschedule()}
                    disabled={busyId === reschedule.id}
                  >
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PatientShell>
  );
}
