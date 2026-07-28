"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { hmsGet, hmsMutate } from "@/lib/hms/client-api";
import type { AdminNotification } from "@/lib/hms/types";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function NotificationsPanel() {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hmsGet<{ data: AdminNotification[] }>(
        "/api/admin/notifications"
      );
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

  const markAll = async () => {
    try {
      await hmsMutate("/api/admin/notifications", "PATCH", {
        mark_all_read: true,
      });
      toast.success("All marked read");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const markOne = async (id: string) => {
    try {
      await hmsMutate("/api/admin/notifications", "PATCH", {
        id,
        is_read: true,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const seedSamples = async () => {
    try {
      await Promise.all([
        hmsMutate("/api/admin/notifications", "POST", {
          type: "appointment_confirmed",
          title: "Appointment confirmed",
          message: "A patient booking was confirmed by admin.",
        }),
        hmsMutate("/api/admin/notifications", "POST", {
          type: "appointment_reminder",
          title: "Reminder",
          message: "Upcoming appointments tomorrow — review calendar.",
        }),
        hmsMutate("/api/admin/notifications", "POST", {
          type: "admin",
          title: "System",
          message: "Hospital Management modules are active.",
        }),
      ]);
      toast.success("Sample notifications created");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Confirmations, cancellations, reminders, and admin alerts. Outbound email/SMS/WhatsApp use Gmail/Resend, MSG91, and Meta Cloud API when configured."
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void seedSamples()}>
              Seed samples
            </Button>
            <Button size="sm" variant="outline" onClick={() => void markAll()}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          </div>
        }
      />

      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No notifications yet. Reschedule appointments or seed samples.
            </CardContent>
          </Card>
        ) : (
          items.map((n) => (
            <Card
              key={n.id}
              className={cn(!n.is_read && "border-primary-300 dark:border-primary-800")}
            >
              <CardContent className="flex items-start gap-4 p-5">
                <div className="rounded-xl bg-primary-50 p-3 text-primary-700 dark:bg-primary-950">
                  <Bell className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{n.title}</h3>
                    <Badge variant="outline">{n.type.replace(/_/g, " ")}</Badge>
                    {!n.is_read && <Badge variant="teal">New</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {n.message}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDate(n.created_at)}
                  </p>
                </div>
                {!n.is_read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void markOne(n.id)}
                  >
                    Mark read
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
