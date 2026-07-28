"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { TableSkeleton } from "@/components/admin/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { hmsGet, hmsMutate } from "@/lib/hms/client-api";
import type { Department } from "@/lib/hms/types";

export function DepartmentsManager() {
  const [items, setItems] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "active" as "active" | "inactive",
  });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hmsGet<{ data: Department[] }>("/api/admin/departments");
      setItems(res.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await hmsMutate(`/api/admin/departments/${editingId}`, "PATCH", form);
        toast.success("Department updated");
      } else {
        await hmsMutate("/api/admin/departments", "POST", form);
        toast.success("Department created");
      }
      setOpen(false);
      setEditingId(null);
      setForm({ name: "", description: "", status: "active" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this department?")) return;
    try {
      await hmsMutate(`/api/admin/departments/${id}`, "DELETE");
      toast.success("Deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Clinical departments for doctor assignment"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setForm({ name: "", description: "", status: "active" });
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Department
          </Button>
        }
      />

      {open && (
        <Card>
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            <div>
              <Label className="mb-2 block">Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Cardiology"
              />
            </div>
            <div>
              <Label className="mb-2 block">Status</Label>
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as "active" | "inactive",
                  })
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Slug</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{d.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{d.slug}</td>
                      <td className="max-w-[280px] truncate px-4 py-3 text-muted-foreground">
                        {d.description || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            d.status === "active" ? "success" : "warning"
                          }
                        >
                          {d.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(d.id);
                              setForm({
                                name: d.name,
                                description: d.description || "",
                                status: d.status,
                              });
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void remove(d.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
