"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Pencil, Search, Building2, Ban, Check } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { hmsGet, hmsMutate } from "@/lib/hms/client-api";
import type { InsuranceProvider } from "@/lib/insurance/types";

const empty = {
  provider_name: "",
  provider_code: "",
  provider_type: "private" as const,
  contact_person: "",
  contact_email: "",
  contact_phone: "",
  address: "",
  registration_number: "",
  coverage_notes: "",
};

export function InsuranceProvidersManager() {
  const [items, setItems] = useState<InsuranceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (q) params.q = q;
      params.active = "true";
      const res = await hmsGet<{ data: InsuranceProvider[] }>(
        "/api/admin/insurance/providers",
        params
      );
      setItems(res.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        provider_name: form.provider_name,
        provider_code: form.provider_code,
        provider_type: form.provider_type,
        contact_person: form.contact_person || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        address: form.address || null,
        registration_number: form.registration_number || null,
        coverage_notes: form.coverage_notes || null,
      };
      if (editingId) {
        await hmsMutate(
          `/api/admin/insurance/providers/${editingId}`,
          "PATCH",
          payload
        );
        toast.success("Provider updated");
      } else {
        await hmsMutate("/api/admin/insurance/providers", "POST", payload);
        toast.success("Provider created");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: InsuranceProvider) => {
    try {
      await hmsMutate(
        `/api/admin/insurance/providers/${item.id}`,
        "PATCH",
        { is_active: !item.is_active }
      );
      toast.success(item.is_active ? "Provider deactivated" : "Provider activated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const openEdit = (item: InsuranceProvider) => {
    setEditingId(item.id);
    setForm({
      provider_name: item.provider_name,
      provider_code: item.provider_code,
      provider_type: item.provider_type as typeof empty.provider_type,
      contact_person: item.contact_person || "",
      contact_email: item.contact_email || "",
      contact_phone: item.contact_phone || "",
      address: item.address || "",
      registration_number: item.registration_number || "",
      coverage_notes: item.coverage_notes || "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insurance Providers"
        description="Manage insurance companies and TPAs"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setForm(empty);
              setOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add Provider
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search providers…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search providers"
          />
        </div>
      </div>

      {open && (
        <Card>
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            <div>
              <Label className="mb-2 block">Provider Name *</Label>
              <Input
                value={form.provider_name}
                onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-2 block">Provider Code *</Label>
              <Input
                value={form.provider_code}
                onChange={(e) =>
                  setForm({
                    ...form,
                    provider_code: e.target.value.toUpperCase().replace(/\s+/g, "_"),
                  })
                }
              />
            </div>
            <div>
              <Label className="mb-2 block">Type</Label>
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={form.provider_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    provider_type: e.target.value as typeof form.provider_type,
                  })
                }
              >
                <option value="government">Government</option>
                <option value="private">Private</option>
                <option value="corporate">Corporate</option>
                <option value="tpa">TPA</option>
              </select>
            </div>
            <div>
              <Label className="mb-2 block">Registration No.</Label>
              <Input
                value={form.registration_number}
                onChange={(e) =>
                  setForm({ ...form, registration_number: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="mb-2 block">Contact Person</Label>
              <Input
                value={form.contact_person}
                onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-2 block">Contact Email</Label>
              <Input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-2 block">Contact Phone</Label>
              <Input
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-2 block">Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block">Coverage Notes</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                value={form.coverage_notes}
                onChange={(e) => setForm({ ...form, coverage_notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? <>Saving…</> : editingId ? "Update" : "Create"}
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center">
                      Loading…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No insurance providers found.
                    </td>
                  </tr>
                ) : (
                  items.map((provider) => (
                    <tr
                      key={provider.id}
                      className="border-t border-border"
                    >
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {provider.provider_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {provider.provider_code}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{provider.provider_type}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          {provider.contact_person && (
                            <div>{provider.contact_person}</div>
                          )}
                          {provider.contact_phone && (
                            <div className="text-muted-foreground">
                              {provider.contact_phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={provider.is_active ? "success" : "secondary"}>
                          {provider.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(provider)}
                            aria-label="Edit provider"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleActive(provider)}
                            aria-label={provider.is_active ? "Deactivate" : "Activate"}
                          >
                            {provider.is_active ? (
                              <Ban className="h-3.5 w-3.5 text-amber-500" />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            )}
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
    </div>
  );
}
