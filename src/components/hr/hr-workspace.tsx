"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, LogOut, Plus, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { adminLogoutAction } from "@/lib/auth/actions";
import { formatCurrency } from "@/lib/utils";
import type { HrEmployee, HrLeaveRequest } from "@/lib/hr/types";

type Tab = "employees" | "leave" | "payroll";

export function HrWorkspace() {
  const [tab, setTab] = useState<Tab>("employees");
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [leaves, setLeaves] = useState<HrLeaveRequest[]>([]);
  const [payroll, setPayroll] = useState<{
    headcount: number;
    monthly_payroll: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [empForm, setEmpForm] = useState({
    full_name: "",
    role_title: "Staff",
    department: "General",
    phone: "",
    salary_monthly: "",
  });

  const [leaveForm, setLeaveForm] = useState({
    employee_id: "",
    leave_type: "casual",
    from_date: "",
    to_date: "",
    reason: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, l, p] = await Promise.all([
        fetch("/api/admin/hr?kind=employees", { cache: "no-store" }),
        fetch("/api/admin/hr?kind=leaves", { cache: "no-store" }),
        fetch("/api/admin/hr?kind=payroll", { cache: "no-store" }),
      ]);
      const ej = await e.json();
      const lj = await l.json();
      const pj = await p.json();
      if (!e.ok) throw new Error(ej.error || "Employees failed");
      setEmployees(ej.data || []);
      setLeaves(lj.data || []);
      setPayroll(pj.data || null);
      if (!leaveForm.employee_id && ej.data?.[0]?.id) {
        setLeaveForm((f) => ({ ...f, employee_id: ej.data[0].id }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [leaveForm.employee_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const addEmployee = async () => {
    if (!empForm.full_name.trim()) {
      toast.error("Name required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "employee",
          ...empForm,
          salary_monthly: Number(empForm.salary_monthly) || 0,
          phone: empForm.phone || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.success("Employee added");
      setEmpForm({
        full_name: "",
        role_title: "Staff",
        department: "General",
        phone: "",
        salary_monthly: "",
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const addLeave = async () => {
    if (!leaveForm.employee_id || !leaveForm.from_date || !leaveForm.to_date) {
      toast.error("Employee and dates required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave", ...leaveForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.success("Leave request submitted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const setLeaveStatus = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/admin/hr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave_status", id, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.success(`Leave ${status}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-bold">HR Workspace</h1>
            <p className="text-xs text-muted-foreground">
              Employees · Leave · Payroll estimate
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/doctors">
              <Button size="sm" variant="outline">
                Doctors
              </Button>
            </Link>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <form action={adminLogoutAction}>
              <Button size="sm" variant="ghost" type="submit">
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div
          className="flex flex-wrap gap-1 rounded-xl bg-muted p-1"
          role="tablist"
        >
          {(
            [
              ["employees", "Employees"],
              ["leave", "Leave"],
              ["payroll", "Payroll"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                tab === id ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "employees" && (
          <>
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="font-semibold">Add employee</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-xs">Full name</Label>
                    <Input
                      value={empForm.full_name}
                      onChange={(e) =>
                        setEmpForm({ ...empForm, full_name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Role title</Label>
                    <Input
                      value={empForm.role_title}
                      onChange={(e) =>
                        setEmpForm({ ...empForm, role_title: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Department</Label>
                    <Input
                      value={empForm.department}
                      onChange={(e) =>
                        setEmpForm({ ...empForm, department: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">
                      Monthly salary (₹)
                    </Label>
                    <Input
                      type="number"
                      value={empForm.salary_monthly}
                      onChange={(e) =>
                        setEmpForm({
                          ...empForm,
                          salary_monthly: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <Button onClick={() => void addEmployee()} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-0">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Dept</th>
                      <th className="px-4 py-3">Salary</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="px-4 py-3 font-medium">{e.full_name}</td>
                        <td className="px-4 py-3">{e.role_title}</td>
                        <td className="px-4 py-3">{e.department}</td>
                        <td className="px-4 py-3">
                          {formatCurrency(e.salary_monthly)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">{e.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}

        {tab === "leave" && (
          <>
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="font-semibold">New leave request</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-xs">Employee</Label>
                    <select
                      className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                      value={leaveForm.employee_id}
                      onChange={(e) =>
                        setLeaveForm({
                          ...leaveForm,
                          employee_id: e.target.value,
                        })
                      }
                    >
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Type</Label>
                    <select
                      className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                      value={leaveForm.leave_type}
                      onChange={(e) =>
                        setLeaveForm({
                          ...leaveForm,
                          leave_type: e.target.value,
                        })
                      }
                    >
                      <option value="casual">Casual</option>
                      <option value="sick">Sick</option>
                      <option value="earned">Earned</option>
                      <option value="unpaid">Unpaid</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">From</Label>
                    <Input
                      type="date"
                      value={leaveForm.from_date}
                      onChange={(e) =>
                        setLeaveForm({
                          ...leaveForm,
                          from_date: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">To</Label>
                    <Input
                      type="date"
                      value={leaveForm.to_date}
                      onChange={(e) =>
                        setLeaveForm({ ...leaveForm, to_date: e.target.value })
                      }
                    />
                  </div>
                </div>
                <Button onClick={() => void addLeave()} disabled={saving}>
                  Submit leave
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-0">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Dates</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-muted-foreground"
                        >
                          No leave requests.
                        </td>
                      </tr>
                    ) : (
                      leaves.map((l) => (
                        <tr key={l.id} className="border-t">
                          <td className="px-4 py-3">
                            {l.employee?.full_name || l.employee_id}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {l.from_date} → {l.to_date} ({l.days}d)
                          </td>
                          <td className="px-4 py-3 capitalize">{l.leave_type}</td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary">{l.status}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            {l.status === "pending" && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    void setLeaveStatus(l.id, "approved")
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void setLeaveStatus(l.id, "rejected")
                                  }
                                >
                                  Reject
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}

        {tab === "payroll" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <div className="text-3xl font-bold">
                  {payroll?.headcount ?? 0}
                </div>
                <div className="text-sm text-muted-foreground">
                  Active headcount
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-3xl font-bold">
                  {formatCurrency(payroll?.monthly_payroll ?? 0)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Estimated monthly payroll
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
