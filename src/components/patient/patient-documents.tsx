"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Upload } from "lucide-react";
import { PatientShell } from "@/components/patient/patient-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClientOrNull } from "@/lib/supabase/client";
import { DOC_TYPES, type PatientDocument } from "@/lib/patient/types";
import { getDemoDashboard } from "@/lib/patient/service";

export function PatientDocumentsPage() {
  const [items, setItems] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("other");
  const [file, setFile] = useState<File | null>(null);
  const name = getDemoDashboard().patient?.full_name;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/patient/documents", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setItems(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async () => {
    if (!file || !title.trim()) {
      toast.error("Title and file are required");
      return;
    }
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowed.includes(file.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) {
      toast.error("Allowed: PDF, JPG, PNG, WebP");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClientOrNull();
      if (!supabase) {
        toast.error("Document upload requires Supabase patient login");
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sign in with email to upload documents");
        return;
      }

      const path = `${user.id}/${Date.now()}-${file.name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")}`;

      const { error: upErr } = await supabase.storage
        .from("patient-files")
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw new Error(upErr.message);

      const {
        data: { publicUrl },
      } = supabase.storage.from("patient-files").getPublicUrl(path);

      // Prefer signed URL for private bucket — fall back to path reference
      let file_url = publicUrl;
      const { data: signed } = await supabase.storage
        .from("patient-files")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signed?.signedUrl) file_url = signed.signedUrl;

      const res = await fetch("/api/patient/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          file_url,
          file_name: file.name,
          mime_type: file.type,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");

      toast.success("Document uploaded");
      setTitle("");
      setFile(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <PatientShell patientName={name}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My documents</h1>
          <p className="text-sm text-muted-foreground">
            Insurance, ID, referrals, prescriptions (PDF / images)
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            <div>
              <Label className="mb-2 block">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Aadhaar copy"
              />
            </div>
            <div>
              <Label className="mb-2 block">Type</Label>
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block">File</Label>
              <Input
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Button onClick={() => void upload()} disabled={uploading}>
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload document
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No documents uploaded yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((d) => (
              <Card key={d.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div>
                    <p className="font-semibold">{d.title}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {d.type.replace(/_/g, " ")} ·{" "}
                      {new Date(d.uploaded_at).toLocaleString()}
                    </p>
                  </div>
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" variant="outline">
                      Open
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PatientShell>
  );
}
