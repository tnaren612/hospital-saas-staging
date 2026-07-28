"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  FileText,
  Loader2,
  Package,
  Stethoscope,
  XCircle,
} from "lucide-react";
import { PatientShell } from "@/components/patient/patient-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/admin/ui/skeleton";
import { formatDate } from "@/lib/utils";
import type { PatientDashboardData } from "@/lib/patient/types";
import { getDemoDashboard } from "@/lib/patient/service";
import { setPatient } from "@/lib/storage";

export function PatientDashboard() {
  const router = useRouter();
  const [data, setData] = useState<PatientDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/patient/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        setData(json.data as PatientDashboardData);
        if (json.data.mode === "unauthenticated") {
          // try demo local
          const demo = getDemoDashboard();
          if (demo.patient) setData(demo);
          else router.replace("/patient/login");
        }
      } else {
        const demo = getDemoDashboard();
        if (demo.patient) setData(demo);
        else router.replace("/patient/login");
      }
    } catch {
      const demo = getDemoDashboard();
      if (demo.patient) setData(demo);
      else router.replace("/patient/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data?.patient) {
    return (
      <PatientShell>
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        </div>
      </PatientShell>
    );
  }

  const cards = [
    {
      label: "Upcoming",
      value: data.counts.upcoming,
      icon: CalendarDays,
      href: "/patient/appointments",
    },
    {
      label: "Completed",
      value: data.counts.completed,
      icon: CheckCircle2,
      href: "/patient/appointments",
    },
    {
      label: "Cancelled",
      value: data.counts.cancelled,
      icon: XCircle,
      href: "/patient/appointments",
    },
    {
      label: "Reports",
      value: data.counts.reports,
      icon: FileText,
      href: "/patient/reports",
    },
    {
      label: "Packages",
      value: data.counts.packages,
      icon: Package,
      href: "/health-packages",
    },
    {
      label: "Notifications",
      value: data.counts.unreadNotifications,
      icon: Bell,
      href: "/patient/notifications",
    },
  ];

  return (
    <PatientShell patientName={data.patient.full_name}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Welcome
            </p>
            <h1 className="text-2xl font-bold">{data.patient.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              {data.patient.mrn ? `MRN ${data.patient.mrn} · ` : ""}
              {data.patient.phone || data.patient.email}
              {data.mode === "demo" ? " · Demo mode" : ""}
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
                "Refresh"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPatient(null);
                router.push("/patient/login");
              }}
            >
              Logout
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.label} href={c.href}>
              <Card className="h-full transition hover:shadow-lift">
                <CardContent className="flex items-center gap-3 p-5">
                  <div className="rounded-xl bg-primary-50 p-2.5 text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                    <c.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className="text-2xl font-bold">{c.value}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Upcoming appointments</h2>
                <Link
                  href="/patient/appointments"
                  className="text-xs font-medium text-primary-700 dark:text-primary-300"
                >
                  View all
                </Link>
              </div>
              {data.upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upcoming visits.{" "}
                  <Link href="/appointment" className="underline">
                    Book now
                  </Link>
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.upcoming.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-xl border px-3 py-2 text-sm"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{a.doctorName}</span>
                        <Badge variant="outline" className="capitalize">
                          {a.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(a.date)} · {a.timeSlot}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="font-semibold">Assigned doctor</h2>
              {data.assignedDoctor ? (
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-muted p-3">
                    <Stethoscope className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-medium">{data.assignedDoctor.name}</p>
                    {data.assignedDoctor.title ? (
                      <p className="text-sm text-muted-foreground">
                        {data.assignedDoctor.title}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {data.assignedDoctor.slug ? (
                        <Link
                          href={`/doctors/${data.assignedDoctor.slug}`}
                        >
                          <Button size="sm" variant="outline">
                            Profile
                          </Button>
                        </Link>
                      ) : (
                        <Link href="/doctors">
                          <Button size="sm" variant="outline">
                            Doctors
                          </Button>
                        </Link>
                      )}
                      <Link
                        href={`/appointment?doctor=${encodeURIComponent(data.assignedDoctor.id)}`}
                      >
                        <Button size="sm">Book again</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Book an appointment to connect with a doctor.
                </p>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold">
                  Recent notifications
                </h3>
                {data.notifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No notifications yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.notifications.slice(0, 4).map((n) => (
                      <li
                        key={n.id}
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        <p className="font-medium">{n.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {n.message}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PatientShell>
  );
}
