"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import toast from "react-hot-toast";
import {
  CalendarClock,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import type { Appointment, AppointmentStatus } from "@/types";

const FILTERS: Array<"all" | AppointmentStatus> = [
  "all",
  "confirmed",
  "checked_in",
  "upcoming",
  "pending",
  "completed",
  "no_show",
  "cancelled",
];

export function AdminAppointments() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [filter, setFilter] = useState<"all" | AppointmentStatus>("all");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [queueOnly, setQueueOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mode, setMode] = useState("");
  const [reschedule, setReschedule] = useState<Appointment | null>(null);
  const [rsDate, setRsDate] = useState("");
  const [rsTime, setRsTime] = useState("");
  const [rsSaving, setRsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (queueOnly) {
        const params = new URLSearchParams();
        params.set(
          "date",
          dateFilter || new Date().toISOString().slice(0, 10)
        );
        const res = await fetch(
          `/api/admin/appointments/queue?${params.toString()}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load queue");
        setItems(json.data || []);
        setMode("queue");
      } else {
        const params = new URLSearchParams();
        if (filter !== "all") params.set("status", filter);
        if (search.trim()) params.set("q", search.trim());
        if (dateFilter) params.set("date", dateFilter);
        const res = await fetch(
          `/api/admin/appointments?${params.toString()}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        setItems(json.data || []);
        setMode(json.mode || "");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filter, search, dateFilter, queueOnly]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((a) => {
      map.set(a.date, (map.get(a.date) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, count]) => ({ date: date.slice(5), count }));
  }, [items]);

  const setStatus = async (
    id: string,
    status: AppointmentStatus,
    extra?: Record<string, unknown>
  ) => {
    if (
      status === "cancelled" &&
      !confirm("Cancel this appointment? The time slot will become free.")
    ) {
      return;
    }
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || "Update failed");
      toast.success(`Marked as ${status}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  };

  const checkIn = async (id: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_in: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Check-in failed");
      toast.success("Patient checked in");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setUpdatingId(null);
    }
  };

  const openReschedule = (a: Appointment) => {
    setReschedule(a);
    setRsDate(a.date);
    setRsTime(a.timeSlot);
  };

  const submitReschedule = async () => {
    if (!reschedule) return;
    if (!rsDate || !rsTime) {
      toast.error("Date and time are required");
      return;
    }
    setRsSaving(true);
    try {
      const res = await fetch(`/api/admin/appointments/${reschedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: rsDate, timeSlot: rsTime }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || "Reschedule failed");
      }
      toast.success("Appointment rescheduled");
      setReschedule(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reschedule failed");
    } finally {
      setRsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            Search, filter, cancel, reschedule, check-in, queue tokens
            {mode ? ` · ${mode}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={queueOnly ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setQueueOnly((v) => !v);
              if (!dateFilter) {
                setDateFilter(new Date().toISOString().slice(0, 10));
              }
            }}
          >
            Today&apos;s queue
          </Button>
          <Button
            variant="outline"
            size="sm"
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
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search name, phone, email, doctor, token…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search appointments"
            disabled={queueOnly}
          />
        </div>
        <div>
          <Label htmlFor="appt-date" className="mb-1 block text-xs">
            Date
          </Label>
          <Input
            id="appt-date"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-auto"
          />
        </div>
        {!queueOnly && (
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  filter === f
                    ? "bg-primary-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {f.replace("_", " ")}
              </button>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-4 md:p-6">
          <h2 className="mb-4 font-semibold">Volume by date</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={
                  chartData.length ? chartData : [{ date: "—", count: 0 }]
                }
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#1a5ff5" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Doctor / Dept</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Problem</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No appointments match your filters.
                    </td>
                  </tr>
                ) : (
                  items.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        {a.queueToken != null ? (
                          <span className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-primary-50 px-2 text-sm font-bold text-primary-800 dark:bg-primary-950 dark:text-primary-200">
                            #{a.queueToken}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {a.patientName}
                        {a.bookingRef ? (
                          <div className="text-xs font-normal text-muted-foreground">
                            {a.bookingRef}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div>{a.phone}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.email}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{a.doctorName}</div>
                        {a.departmentName ? (
                          <div className="text-xs text-muted-foreground">
                            {a.departmentName}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {formatDate(a.date)}
                        <div className="text-xs text-muted-foreground">
                          {a.timeSlot} · {a.type}
                        </div>
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3">
                        {a.problem}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            a.status === "completed" || a.status === "checked_in"
                              ? "success"
                              : a.status === "cancelled" || a.status === "no_show"
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
                            variant="ghost"
                            disabled={
                              updatingId === a.id ||
                              a.status === "cancelled" ||
                              a.status === "completed" ||
                              a.status === "no_show" ||
                              a.status === "checked_in"
                            }
                            onClick={() => void checkIn(a.id)}
                          >
                            Check-in
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={
                              updatingId === a.id ||
                              a.status === "cancelled" ||
                              a.status === "completed"
                            }
                            onClick={() => openReschedule(a)}
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            Reschedule
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={updatingId === a.id}
                            onClick={() => void setStatus(a.id, "confirmed")}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={updatingId === a.id}
                            onClick={() => void setStatus(a.id, "completed")}
                          >
                            Complete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={
                              updatingId === a.id ||
                              a.status === "cancelled" ||
                              a.status === "completed"
                            }
                            onClick={() => void setStatus(a.id, "no_show")}
                          >
                            No-show
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={
                              updatingId === a.id || a.status === "cancelled"
                            }
                            onClick={() => void setStatus(a.id, "cancelled")}
                          >
                            Cancel
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

      {/* Reschedule modal */}
      {reschedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md shadow-2xl">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Reschedule</h2>
                  <p className="text-sm text-muted-foreground">
                    {reschedule.patientName} · {reschedule.doctorName}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1 hover:bg-muted"
                  onClick={() => setReschedule(null)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <Label className="mb-2 block">New date</Label>
                <Input
                  type="date"
                  value={rsDate}
                  onChange={(e) => setRsDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-2 block">New time slot</Label>
                <Input
                  value={rsTime}
                  onChange={(e) => setRsTime(e.target.value)}
                  placeholder="e.g. 10:00 AM"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Conflict detection runs server-side (duplicate + leave days).
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setReschedule(null)}
                  disabled={rsSaving}
                >
                  Close
                </Button>
                <Button onClick={() => void submitReschedule()} disabled={rsSaving}>
                  {rsSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
