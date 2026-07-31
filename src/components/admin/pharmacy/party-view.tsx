"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { Plus, Search, Upload } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  enqueueMutation,
  useOfflineEntities,
  useOfflineStore,
} from "@/lib/pharmacy/offline";
import { createUuid } from "@/lib/pharmacy/offline/storage";

type PartyRow = Record<string, unknown> & {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
};

const FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
] as const;

export function PartyView({
  entity,
  title,
  description,
  emptyHint,
}: {
  entity: "customer" | "supplier";
  title: string;
  description: string;
  emptyHint: string;
}) {
  const storage = useOfflineStore();
  const rows = useOfflineEntities<PartyRow>(entity);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.data.name, r.data.phone, r.data.email, r.data.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [rows, q]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    const id = createUuid();
    const payload: Record<string, unknown> = {
      ...form,
      _clientId: id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await enqueueMutation(storage, {
      id,
      hospitalId: "local",
      entity,
      action: "create",
      payload,
      targetKey: `${entity}::${id}`,
    });
    toast.success(`${title.slice(0, -1)} saved offline — syncs automatically`);
    setShowForm(false);
    setForm({});
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <Link href="/admin/pharmacy/import">
              <Button size="sm" variant="outline">
                <Upload className="h-4 w-4" aria-hidden />
                Import
              </Button>
            </Link>
            <Button size="sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          </>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="p-5">
            <form onSubmit={(e) => void save(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`${entity}-${f.key}`}>
                    {f.label}
                    {"required" in f && f.required ? " *" : ""}
                  </Label>
                  <Input
                    id={`${entity}-${f.key}`}
                    required={"required" in f && f.required}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  Save offline
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="pl-10"
              placeholder="Search name, phone, email, city…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={`Search ${title.toLowerCase()}`}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  {FIELDS.map((f) => (
                    <th key={f.key} className="py-2 pr-3">
                      {f.label}
                    </th>
                  ))}
                  <th className="py-2">Added</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rec) => (
                  <tr key={rec.id} className="border-b last:border-0">
                    {FIELDS.map((f) => (
                      <td key={f.key} className="py-2 pr-3">
                        {String(rec.data[f.key] ?? "—")}
                      </td>
                    ))}
                    <td className="py-2 text-xs text-muted-foreground">
                      {rec.updatedAt.slice(0, 10)}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={FIELDS.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                      {emptyHint}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
