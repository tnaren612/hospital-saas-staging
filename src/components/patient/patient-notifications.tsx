"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PatientShell } from "@/components/patient/patient-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PatientNotification } from "@/lib/patient/types";
import { getDemoPatientName } from "@/lib/patient/service";

export function PatientNotificationsPage() {
  const [items, setItems] = useState<PatientNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const name = getDemoPatientName();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/patient/notifications", {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setItems(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: "read" | "delete") => {
    try {
      const res = await fetch("/api/patient/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.success(action === "read" ? "Marked read" : "Deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  return (
    <PatientShell patientName={name ?? undefined}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Appointment updates, report alerts, package reminders
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((n) => (
              <Card key={n.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{n.title}</p>
                      {!n.is_read ? (
                        <Badge variant="teal">Unread</Badge>
                      ) : null}
                      <Badge variant="outline" className="capitalize">
                        {n.type.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {n.message}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!n.is_read && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void act(n.id, "read")}
                      >
                        Mark read
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void act(n.id, "delete")}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PatientShell>
  );
}
