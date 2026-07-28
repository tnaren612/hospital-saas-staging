"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  FileText,
  Receipt,
  LogOut,
  Video,
  Clock,
} from "lucide-react";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAppointments, getPatient, setPatient } from "@/lib/storage";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";
import type { Appointment, Invoice, Patient, PatientReport } from "@/types";

const demoReports: PatientReport[] = [
  {
    id: "r1",
    title: "Spirometry Report",
    date: "2026-05-12",
    type: "PFT",
    status: "Ready",
  },
  {
    id: "r2",
    title: "Chest X-Ray Review",
    date: "2026-04-03",
    type: "Imaging",
    status: "Ready",
  },
];

const demoInvoices: Invoice[] = [
  {
    id: "inv1",
    title: "OPD Consultation",
    amount: 500,
    date: "2026-05-12",
    status: "paid",
  },
  {
    id: "inv2",
    title: "Pulmonary Function Test",
    amount: 1200,
    date: "2026-05-12",
    status: "pending",
  },
];

export function PatientDashboardContent() {
  const { t } = useLocale();
  const router = useRouter();
  const [patient, setPatientState] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    const p = getPatient();
    if (!p) {
      router.replace("/patient/login");
      return;
    }
    setPatientState(p);
    const all = getAppointments().filter((a) => a.phone === p.phone);
    setAppointments(all);
  }, [router]);

  if (!patient) {
    return (
      <Section>
        <p className="text-center text-muted-foreground">Checking session…</p>
      </Section>
    );
  }

  const upcoming = appointments.filter(
    (a) => a.status === "confirmed" || a.status === "upcoming" || a.status === "pending"
  );
  const history = appointments;

  return (
    <div className="page-enter">
      <section className="bg-hero-gradient py-12 text-white">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm text-white/70">{t.patient.dashboard}</p>
            <h1 className="text-3xl font-bold">{patient.name}</h1>
            <p className="text-white/80">{patient.phone}</p>
          </div>
          <Button
            variant="glass"
            onClick={() => {
              setPatient(null);
              router.push("/patient/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            {t.patient.logout}
          </Button>
        </div>
      </section>

      <Section>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center gap-2 font-semibold">
                <Clock className="h-5 w-5 text-primary-600" />
                {t.patient.upcoming}
              </div>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upcoming appointments.{" "}
                  <Link href="/appointment" className="text-primary-600 underline">
                    Book now
                  </Link>
                </p>
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-xl border border-border p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {formatDate(a.date)} · {a.timeSlot}
                        </span>
                        <Badge variant="success">{a.status}</Badge>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {a.doctorName} · {a.type}
                      </div>
                      {a.type === "video" && (
                        <Link href="/video-consult/meeting" className="mt-2 inline-flex">
                          <Button size="sm" variant="teal">
                            <Video className="h-3.5 w-3.5" /> Join Meeting
                          </Button>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center gap-2 font-semibold">
                <Calendar className="h-5 w-5 text-primary-600" />
                {t.patient.history}
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No appointments yet for this phone number.
                </p>
              ) : (
                <ul className="max-h-72 space-y-3 overflow-y-auto">
                  {history.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-xl border border-border p-3 text-sm"
                    >
                      <div className="font-medium">
                        {formatDate(a.date)} · {a.timeSlot}
                      </div>
                      <div className="text-muted-foreground">{a.problem}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center gap-2 font-semibold">
                <FileText className="h-5 w-5 text-primary-600" />
                {t.patient.reports}
              </div>
              <ul className="space-y-3">
                {demoReports.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                  >
                    <div>
                      <div className="font-medium">{r.title}</div>
                      <div className="text-muted-foreground">
                        {formatDate(r.date)} · {r.type}
                      </div>
                    </div>
                    <Badge variant="teal">{r.status}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center gap-2 font-semibold">
                <Receipt className="h-5 w-5 text-primary-600" />
                {t.patient.invoices}
              </div>
              <ul className="space-y-3">
                {demoInvoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                  >
                    <div>
                      <div className="font-medium">{inv.title}</div>
                      <div className="text-muted-foreground">
                        {formatDate(inv.date)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        {formatCurrency(inv.amount)}
                      </div>
                      <Badge
                        variant={inv.status === "paid" ? "success" : "warning"}
                        className="mt-1"
                      >
                        {inv.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>
    </div>
  );
}
