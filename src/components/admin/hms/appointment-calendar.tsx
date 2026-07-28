"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
} from "date-fns";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { hmsGet, hmsMutate } from "@/lib/hms/client-api";
import type { Appointment } from "@/types";
import type { HospitalDoctor } from "@/lib/hms/types";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week";

export function AppointmentCalendar() {
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [doctorId, setDoctorId] = useState("");
  const [doctors, setDoctors] = useState<HospitalDoctor[]>([]);
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "week") {
      return {
        from: format(startOfWeek(cursor), "yyyy-MM-dd"),
        to: format(endOfWeek(cursor), "yyyy-MM-dd"),
        days: eachDayOfInterval({
          start: startOfWeek(cursor),
          end: endOfWeek(cursor),
        }),
      };
    }
    return {
      from: format(startOfMonth(cursor), "yyyy-MM-dd"),
      to: format(endOfMonth(cursor), "yyyy-MM-dd"),
      days: eachDayOfInterval({
        start: startOfMonth(cursor),
        end: endOfMonth(cursor),
      }),
    };
  }, [cursor, view]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cal, docs] = await Promise.all([
        hmsGet<{ data: Appointment[] }>("/api/admin/calendar", {
          from: range.from,
          to: range.to,
          doctor_id: doctorId || undefined,
        }),
        hmsGet<{ data: HospitalDoctor[] }>("/api/admin/doctors"),
      ]);
      setItems(cal.data || []);
      setDoctors(docs.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Calendar load failed");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, doctorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    items.forEach((a) => {
      const list = map.get(a.date) || [];
      list.push(a);
      map.set(a.date, list);
    });
    return map;
  }, [items]);

  const reschedule = async (id: string, date: string, time_slot: string) => {
    try {
      await hmsMutate("/api/admin/calendar", "POST", {
        id,
        date,
        time_slot,
        doctor_id: doctorId || undefined,
      });
      toast.success("Rescheduled");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Conflict";
      toast.error(msg);
    }
  };

  const onDropDay = async (day: Date) => {
    if (!dragId) return;
    const appt = items.find((a) => a.id === dragId);
    if (!appt) return;
    const date = format(day, "yyyy-MM-dd");
    await reschedule(dragId, date, appt.timeSlot);
    setDragId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointment Calendar"
        description="Monthly / weekly views · drag appointment cards to reschedule · conflict detection"
        onRefresh={() => void load()}
        loading={loading}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setCursor(
              view === "week" ? addDays(cursor, -7) : addDays(startOfMonth(cursor), -1)
            )
          }
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-[140px] text-center font-semibold">
          {format(cursor, view === "week" ? "'Week of' dd MMM yyyy" : "MMMM yyyy")}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setCursor(
              view === "week" ? addDays(cursor, 7) : addDays(endOfMonth(cursor), 1)
            )
          }
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="ml-2 flex gap-1">
          {(["month", "week"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold capitalize",
                view === v
                  ? "bg-primary-600 text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <select
          className="ml-auto h-9 rounded-xl border border-input bg-background px-3 text-sm"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
        >
          <option value="">All doctors</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
          <option value="dr-varaprasad">dr-varaprasad (booking id)</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-4">
          {view === "month" ? (
            <div className="grid grid-cols-7 gap-2">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div
                  key={d}
                  className="text-center text-xs font-semibold text-muted-foreground"
                >
                  {d}
                </div>
              ))}
              {/* pad start */}
              {Array.from({
                length: startOfMonth(cursor).getDay(),
              }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {range.days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const list = byDate.get(key) || [];
                return (
                  <div
                    key={key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => void onDropDay(day)}
                    className={cn(
                      "min-h-[100px] rounded-xl border border-border p-2 transition",
                      !isSameMonth(day, cursor) && "opacity-40",
                      isSameDay(day, new Date()) && "border-primary-400 bg-primary-50/40 dark:bg-primary-950/20"
                    )}
                  >
                    <div className="mb-1 text-xs font-semibold">
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {list.slice(0, 4).map((a) => (
                        <div
                          key={a.id}
                          draggable
                          onDragStart={() => setDragId(a.id)}
                          className="cursor-grab rounded-lg bg-primary-600/90 px-1.5 py-1 text-[10px] font-medium text-white active:cursor-grabbing"
                          title={`${a.patientName} · ${a.timeSlot}`}
                        >
                          {a.timeSlot} {a.patientName.split(" ")[0]}
                        </div>
                      ))}
                      {list.length > 4 && (
                        <div className="text-[10px] text-muted-foreground">
                          +{list.length - 4} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-7">
              {range.days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const list = byDate.get(key) || [];
                return (
                  <div
                    key={key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => void onDropDay(day)}
                    className="min-h-[220px] rounded-2xl border border-border p-3"
                  >
                    <div className="mb-2 text-sm font-semibold">
                      {format(day, "EEE dd")}
                    </div>
                    <div className="space-y-2">
                      {list.map((a) => (
                        <div
                          key={a.id}
                          draggable
                          onDragStart={() => setDragId(a.id)}
                          className="cursor-grab rounded-xl border border-border bg-card p-2 text-xs shadow-soft active:cursor-grabbing"
                        >
                          <div className="font-semibold">{a.timeSlot}</div>
                          <div>{a.patientName}</div>
                          <div className="text-muted-foreground">
                            {a.doctorName}
                          </div>
                          <Badge variant="teal" className="mt-1">
                            {a.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Drag an appointment onto another day to reschedule (same time slot).
            Conflicts and doctor leave/holiday are blocked server-side.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
