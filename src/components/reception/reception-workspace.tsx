"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Loader2,
  RefreshCw,
  UserPlus,
  ListOrdered,
  Search,
  LogOut,
  Building2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { adminLogoutAction } from "@/lib/auth/actions";
import { hmsGet, hmsMutate } from "@/lib/hms/client-api";
import type { HospitalDoctor } from "@/lib/hms/types";
import type { Appointment } from "@/types";
import { formatDate } from "@/lib/utils";

type Tab = "queue" | "walkin" | "search";

type QueueSummary = {
  total: number;
  waiting: number;
  checked_in: number;
  completed: number;
  no_show: number;
};

export function ReceptionWorkspace() {
  const [tab, setTab] = useState<Tab>("queue");
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [queue, setQueue] = useState<Appointment[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [doctors, setDoctors] = useState<HospitalDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Appointment[]>([]);

  const [walkIn, setWalkIn] = useState({
    full_name: "",
    phone: "",
    age: "",
    gender: "" as "" | "male" | "female" | "other",
    doctor_id: "",
    problem: "Walk-in consultation",
  });
  const [lastToken, setLastToken] = useState<number | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hmsGet<{
        data: Appointment[];
        summary?: QueueSummary;
      }>("/api/admin/appointments/queue", { date });
      setQueue(res.data || []);
      setSummary(res.summary || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Queue load failed");
    } finally {
      setLoading(false);
    }
  }, [date]);

  const loadDoctors = useCallback(async () => {
    try {
      const res = await hmsGet<{ data: HospitalDoctor[] }>(
        "/api/admin/doctors",
        { status: "active" }
      );
      setDoctors(res.data || []);
      if (!walkIn.doctor_id && res.data?.[0]?.id) {
        setWalkIn((f) => ({ ...f, doctor_id: res.data[0].id }));
      }
    } catch {
      /* optional */
    }
  }, [walkIn.doctor_id]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    void loadDoctors();
  }, [loadDoctors]);

  const checkIn = async (id: string) => {
    setBusyId(id);
    try {
      await hmsMutate(`/api/admin/appointments/${id}`, "PATCH", {
        check_in: true,
      });
      toast.success("Checked in");
      await loadQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (id: string, status: string) => {
    setBusyId(id);
    try {
      await hmsMutate(`/api/admin/appointments/${id}`, "PATCH", { status });
      toast.success(`Marked ${status.replace("_", " ")}`);
      await loadQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const submitWalkIn = async () => {
    if (!walkIn.full_name.trim() || !walkIn.phone || !walkIn.doctor_id) {
      toast.error("Name, phone, and doctor are required");
      return;
    }
    setSaving(true);
    setLastToken(null);
    try {
      const doc = doctors.find((d) => d.id === walkIn.doctor_id);
      const res = await hmsMutate<{
        data: Appointment;
        queue_token: number;
        booking_ref?: string;
      }>("/api/admin/reception/walk-in", "POST", {
        full_name: walkIn.full_name,
        phone: walkIn.phone,
        age: walkIn.age ? Number(walkIn.age) : null,
        gender: walkIn.gender || null,
        doctor_id: walkIn.doctor_id,
        doctor_name: doc?.name,
        department_id: doc?.department_id,
        problem: walkIn.problem,
        date,
        type: "in-person",
      });
      setLastToken(res.queue_token);
      toast.success(`Walk-in registered · Token #${res.queue_token}`);
      setWalkIn({
        full_name: "",
        phone: "",
        age: "",
        gender: "",
        doctor_id: walkIn.doctor_id,
        problem: "Walk-in consultation",
      });
      setTab("queue");
      await loadQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Walk-in failed");
    } finally {
      setSaving(false);
    }
  };

  const runSearch = async () => {
    if (searchQ.trim().length < 2) {
      toast.error("Enter at least 2 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await hmsGet<{ data: Appointment[] }>(
        "/api/admin/appointments",
        { q: searchQ.trim(), date }
      );
      setSearchResults(res.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof ListOrdered }[] = [
    { id: "queue", label: "Today's queue", icon: ListOrdered },
    { id: "walkin", label: "Walk-in", icon: UserPlus },
    { id: "search", label: "Find patient", icon: Search },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Reception Workspace
              </h1>
              <p className="text-xs text-muted-foreground">
                Walk-in · Token queue · Check-in
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/patients">
              <Button size="sm" variant="outline">
                Patients
              </Button>
            </Link>
            <Link href="/admin/appointments">
              <Button size="sm" variant="outline">
                All appointments
              </Button>
            </Link>
            <Link href="/admin/hospital-billing">
              <Button size="sm" variant="outline">
                Bills
              </Button>
            </Link>
            <form action={adminLogoutAction}>
              <Button size="sm" variant="ghost" type="submit">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-end gap-3">
          <div
            className="flex flex-wrap gap-1 rounded-xl bg-muted p-1"
            role="tablist"
            aria-label="Reception views"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                  tab === t.id
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="rx-date" className="mb-1 block text-xs">
              Date
            </Label>
            <Input
              id="rx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-auto"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadQueue()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>

        {summary && tab === "queue" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ["Total", summary.total],
                ["Waiting", summary.waiting],
                ["Checked in", summary.checked_in],
                ["Completed", summary.completed],
                ["No-show", summary.no_show],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold tabular-nums">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {lastToken != null && (
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
            role="status"
          >
            Last walk-in token issued:{" "}
            <strong className="text-lg">#{lastToken}</strong>
          </div>
        )}

        {tab === "queue" && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Token</th>
                      <th className="px-4 py-3">Patient</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Doctor</th>
                      <th className="px-4 py-3">Slot</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && queue.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center">
                          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                        </td>
                      </tr>
                    ) : queue.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-12 text-center text-muted-foreground"
                        >
                          No appointments in queue for {formatDate(date)}.
                        </td>
                      </tr>
                    ) : (
                      queue.map((a) => (
                        <tr key={a.id} className="border-t border-border">
                          <td className="px-4 py-3">
                            <span className="inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg bg-primary-600 px-2 font-bold text-white">
                              {a.queueToken != null ? `#${a.queueToken}` : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {a.patientName}
                            {a.bookingRef ? (
                              <div className="text-xs font-normal text-muted-foreground">
                                {a.bookingRef}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">{a.phone}</td>
                          <td className="px-4 py-3">{a.doctorName}</td>
                          <td className="px-4 py-3">{a.timeSlot}</td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                a.status === "checked_in" ||
                                a.status === "completed"
                                  ? "success"
                                  : a.status === "no_show"
                                    ? "danger"
                                    : "teal"
                              }
                            >
                              {a.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                disabled={
                                  busyId === a.id ||
                                  a.status === "checked_in" ||
                                  a.status === "completed" ||
                                  a.status === "no_show" ||
                                  a.status === "cancelled"
                                }
                                onClick={() => void checkIn(a.id)}
                              >
                                Check-in
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId === a.id}
                                onClick={() =>
                                  void setStatus(a.id, "completed")
                                }
                              >
                                Complete
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busyId === a.id}
                                onClick={() => void setStatus(a.id, "no_show")}
                              >
                                No-show
                              </Button>
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
        )}

        {tab === "walkin" && (
          <Card>
            <CardContent className="space-y-4 p-6">
              <div>
                <h2 className="text-lg font-semibold">Register walk-in</h2>
                <p className="text-sm text-muted-foreground">
                  Creates patient record (if new), assigns next token, and adds
                  to today&apos;s queue.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="wi-name" className="mb-2 block">
                    Full name *
                  </Label>
                  <Input
                    id="wi-name"
                    value={walkIn.full_name}
                    onChange={(e) =>
                      setWalkIn({ ...walkIn, full_name: e.target.value })
                    }
                    autoComplete="name"
                  />
                </div>
                <div>
                  <Label htmlFor="wi-phone" className="mb-2 block">
                    Phone *
                  </Label>
                  <Input
                    id="wi-phone"
                    value={walkIn.phone}
                    maxLength={10}
                    inputMode="numeric"
                    onChange={(e) =>
                      setWalkIn({ ...walkIn, phone: e.target.value })
                    }
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <Label htmlFor="wi-age" className="mb-2 block">
                    Age
                  </Label>
                  <Input
                    id="wi-age"
                    type="number"
                    value={walkIn.age}
                    onChange={(e) =>
                      setWalkIn({ ...walkIn, age: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="wi-gender" className="mb-2 block">
                    Gender
                  </Label>
                  <select
                    id="wi-gender"
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    value={walkIn.gender}
                    onChange={(e) =>
                      setWalkIn({
                        ...walkIn,
                        gender: e.target.value as typeof walkIn.gender,
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="wi-doctor" className="mb-2 block">
                    Doctor *
                  </Label>
                  <select
                    id="wi-doctor"
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    value={walkIn.doctor_id}
                    onChange={(e) =>
                      setWalkIn({ ...walkIn, doctor_id: e.target.value })
                    }
                  >
                    <option value="">Select doctor…</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.title ? ` · ${d.title}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="wi-problem" className="mb-2 block">
                    Chief complaint
                  </Label>
                  <Textarea
                    id="wi-problem"
                    value={walkIn.problem}
                    onChange={(e) =>
                      setWalkIn({ ...walkIn, problem: e.target.value })
                    }
                    className="min-h-[80px]"
                  />
                </div>
              </div>
              <Button onClick={() => void submitWalkIn()} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Register &amp; issue token
              </Button>
            </CardContent>
          </Card>
        )}

        {tab === "search" && (
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-[200px] flex-1"
                  placeholder="Name, phone, booking ref…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runSearch();
                  }}
                  aria-label="Search appointments"
                />
                <Button onClick={() => void runSearch()} disabled={loading}>
                  Search
                </Button>
              </div>
              <ul className="divide-y rounded-xl border">
                {searchResults.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Search results for the selected date appear here.
                  </li>
                ) : (
                  searchResults.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {a.patientName}{" "}
                          {a.queueToken != null ? (
                            <Badge variant="secondary">#{a.queueToken}</Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.phone} · {a.doctorName} · {a.timeSlot} ·{" "}
                          {a.status}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === a.id}
                        onClick={() => void checkIn(a.id)}
                      >
                        Check-in
                      </Button>
                    </li>
                  ))
                )}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
