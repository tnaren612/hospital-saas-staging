"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  isBefore,
  startOfDay,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSlots } from "@/lib/data";
import { getBookedSlotKeysForDate, isUsingSupabase } from "@/lib/appointments/service";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimePeriod } from "@/types";

export function DoctorCalendar() {
  const [month, setMonth] = useState(new Date());
  const [selected, setSelected] = useState<Date | null>(new Date());
  const [bookedKeys, setBookedKeys] = useState<string[]>([]);
  const slots = getSlots();
  const usingSupabase = isUsingSupabase();

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    const list: Date[] = [];
    let cur = start;
    while (cur <= end) {
      list.push(cur);
      cur = addDays(cur, 1);
    }
    return list;
  }, [month]);

  const selectedKey = selected ? format(selected, "yyyy-MM-dd") : "";

  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    void (async () => {
      const keys = await getBookedSlotKeysForDate(selectedKey);
      if (!cancelled) setBookedKeys(keys);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  const periods: TimePeriod[] = ["morning", "afternoon", "evening"];

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="text-lg">Doctor Availability Calendar</CardTitle>
        <p className="text-sm text-muted-foreground">
          Interactive calendar — booked slots load from{" "}
          {usingSupabase ? "Supabase" : "local demo storage"}.
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-muted"
            onClick={() => setMonth(addDays(startOfMonth(month), -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="font-semibold">{format(month, "MMMM yyyy")}</div>
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-muted"
            onClick={() => setMonth(addDays(endOfMonth(month), 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const disabled = isBefore(day, startOfDay(new Date()));
            const inMonth = isSameMonth(day, month);
            const active = selected && isSameDay(day, selected);
            return (
              <button
                key={day.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => setSelected(day)}
                className={cn(
                  "aspect-square rounded-xl text-sm transition",
                  !inMonth && "text-muted-foreground/40",
                  disabled && "cursor-not-allowed opacity-40",
                  active
                    ? "bg-primary-600 font-semibold text-white"
                    : "hover:bg-muted"
                )}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            <h4 className="font-semibold">
              Slots for {format(selected, "dd MMM yyyy")}
            </h4>
            {periods.map((period) => (
              <div key={period}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {period}
                </div>
                <div className="flex flex-wrap gap-2">
                  {slots[period].map((time) => {
                    const booked = bookedKeys.includes(`${selectedKey}|${time}`);
                    return (
                      <span
                        key={time}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-xs font-medium",
                          booked
                            ? "border-border bg-muted text-muted-foreground line-through"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                        )}
                      >
                        {time}
                        {booked ? " · Booked" : " · Open"}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
