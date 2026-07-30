"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hmsGet } from "@/lib/hms/client-api";
import {
  downloadExcel,
  downloadTextFile,
  printHtmlReport,
  rowsToTableHtml,
  toCsv,
} from "@/lib/hms/export";
import { formatCurrency } from "@/lib/utils";
import type { HospitalDoctor, Department } from "@/lib/hms/types";
import { useHospitalConfig } from "@/components/hospital/hospital-config-provider";

type ReportResponse = {
  summary: {
    total: number;
    completed: number;
    confirmed: number;
    cancelled: number;
    revenue: number;
    from: string;
    to: string;
  };
  by_day: { date: string; count: number; revenue: number }[];
  by_doctor: { doctor: string; count: number; revenue: number }[];
  export_rows: Record<string, unknown>[];
};

export function ReportsPanel() {
  const { config } = useHospitalConfig();
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [doctorId, setDoctorId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [doctors, setDoctors] = useState<HospitalDoctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [d, dep] = await Promise.all([
          hmsGet<{ data: HospitalDoctor[] }>("/api/admin/doctors"),
          hmsGet<{ data: Department[] }>("/api/admin/departments"),
        ]);
        setDoctors(d.data || []);
        setDepartments(dep.data || []);
      } catch {
        // tables may not exist yet
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hmsGet<ReportResponse>("/api/admin/reports", {
        from,
        to,
        doctor_id: doctorId || undefined,
        department_id: departmentId || undefined,
      });
      setReport(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Report failed");
    } finally {
      setLoading(false);
    }
  }, [from, to, doctorId, departmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const preset = (type: "daily" | "weekly" | "monthly") => {
    const now = new Date();
    if (type === "daily") {
      setFrom(today);
      setTo(today);
    } else if (type === "weekly") {
      setFrom(format(startOfWeek(now), "yyyy-MM-dd"));
      setTo(format(endOfWeek(now), "yyyy-MM-dd"));
    } else {
      setFrom(format(startOfMonth(now), "yyyy-MM-dd"));
      setTo(format(endOfMonth(now), "yyyy-MM-dd"));
    }
  };

  const rows = report?.export_rows || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Daily, weekly, monthly · doctor & department · CSV / Excel / Print"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                downloadTextFile(
                  `ssh-report-${from}-${to}.csv`,
                  toCsv(rows)
                )
              }
            >
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                downloadExcel(`ssh-report-${from}-${to}.xls`, rows)
              }
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                printHtmlReport(
                  `SSH Report ${from} → ${to}`,
                  rowsToTableHtml(rows),
                  config.branding.name
                )
              }
            >
              <Printer className="h-4 w-4" /> PDF / Print
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-3 lg:grid-cols-6">
          <div className="flex gap-2 md:col-span-3 lg:col-span-6">
            {(["daily", "weekly", "monthly"] as const).map((p) => (
              <Button key={p} size="sm" variant="outline" onClick={() => preset(p)}>
                {p}
              </Button>
            ))}
          </div>
          <div>
            <Label className="mb-2 block">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="mb-2 block">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="mb-2 block">Doctor</Label>
            <select
              className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              <option value="">All</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-2 block">Department</Label>
            <select
              className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">All</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {report && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Total", value: report.summary.total },
              { label: "Completed", value: report.summary.completed },
              { label: "Confirmed", value: report.summary.confirmed },
              { label: "Cancelled", value: report.summary.cancelled },
              {
                label: "Revenue",
                value: formatCurrency(report.summary.revenue),
              },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="p-5">
                  <div className="text-2xl font-bold">{c.value}</div>
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">By day</h2>
                <div className="table-scroll max-h-72 overflow-y-auto text-sm">
                  <table className="w-full min-w-[280px]">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="pb-2 text-left">Date</th>
                        <th className="pb-2 text-right">Count</th>
                        <th className="pb-2 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_day.map((d) => (
                        <tr key={d.date} className="border-t border-border/60">
                          <td className="py-2">{d.date}</td>
                          <td className="py-2 text-right">{d.count}</td>
                          <td className="py-2 text-right">
                            {formatCurrency(d.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">By doctor</h2>
                <div className="table-scroll max-h-72 overflow-y-auto text-sm">
                  <table className="w-full min-w-[280px]">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="pb-2 text-left">Doctor</th>
                        <th className="pb-2 text-right">Count</th>
                        <th className="pb-2 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_doctor.map((d) => (
                        <tr key={d.doctor} className="border-t border-border/60">
                          <td className="py-2">{d.doctor}</td>
                          <td className="py-2 text-right">{d.count}</td>
                          <td className="py-2 text-right">
                            {formatCurrency(d.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
