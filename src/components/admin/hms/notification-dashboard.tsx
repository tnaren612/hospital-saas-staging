"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Bell,
  Download,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type {
  NotificationRecord,
  NotificationStats,
} from "@/lib/notifications/core/types";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export function NotificationDashboard() {
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (q.trim()) params.set("q", q.trim());
      if (channel) params.set("channel", channel);
      if (status) params.set("status", status);

      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/notifications?${params}`, { cache: "no-store" }),
        fetch("/api/notifications/stats", { cache: "no-store" }),
      ]);
      const listJson = await listRes.json();
      const statsJson = await statsRes.json();
      if (!listRes.ok) throw new Error(listJson.error || "List failed");
      if (!statsRes.ok) throw new Error(statsJson.error || "Stats failed");
      setItems(listJson.data || []);
      setTotal(listJson.total || 0);
      setStats(statsJson.stats || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [page, q, channel, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const retryOne = async (id: string) => {
    try {
      const res = await fetch("/api/notifications/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Retry failed");
      toast.success("Retried");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  };

  const retryAllFailed = async () => {
    try {
      const res = await fetch("/api/notifications/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processQueue: true, limit: 50 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Queue failed");
      toast.success(`Processed ${json.processed}, ok ${json.ok}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Queue failed");
    }
  };

  const exportCsv = () => {
    const header = [
      "id",
      "channel",
      "provider",
      "recipient",
      "subject",
      "status",
      "retry_count",
      "sent_at",
      "created_at",
    ];
    const lines = [
      header.join(","),
      ...items.map((r) =>
        [
          r.id,
          r.channel,
          r.provider,
          csvEscape(r.recipient),
          csvEscape(r.subject),
          r.status,
          r.retry_count,
          r.sent_at || "",
          r.created_at,
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notifications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Center"
        description="Email, WhatsApp, SMS history, retries, and delivery stats"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/test-notifications">
              <Button size="sm" variant="outline">
                Test tools
              </Button>
            </Link>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => void retryAllFailed()}>
              <RefreshCw className="h-4 w-4" /> Retry failed
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Mail}
          label="Emails sent"
          value={stats?.emails_sent ?? "—"}
        />
        <StatCard
          icon={MessageCircle}
          label="WhatsApp generated"
          value={stats?.whatsapp_generated ?? "—"}
        />
        <StatCard
          icon={Smartphone}
          label="SMS (sent / pending)"
          value={
            stats
              ? `${stats.sms_sent} / ${stats.sms_pending}`
              : "—"
          }
        />
        <StatCard
          icon={Bell}
          label="Success rate"
          value={stats ? `${stats.success_rate}%` : "—"}
          hint={
            stats
              ? `Failures ${stats.failures} · Retries ${stats.retries} · Top: ${stats.most_used_channel}`
              : undefined
          }
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <Input
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="Recipient, subject, message…"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Channel
            </label>
            <select
              className="mt-1 flex h-11 w-full min-w-[120px] rounded-xl border border-input bg-background px-3 text-sm"
              value={channel}
              onChange={(e) => {
                setPage(1);
                setChannel(e.target.value);
              }}
            >
              <option value="">All</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <select
              className="mt-1 flex h-11 w-full min-w-[120px] rounded-xl border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">All</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="table-scroll">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Retry</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      No notifications yet. Use Test tools to send samples.
                    </td>
                  </tr>
                ) : (
                  items.map((r) => (
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="px-4 py-3 capitalize">{r.channel}</td>
                      <td className="px-4 py-3 text-xs">{r.provider}</td>
                      <td className="px-4 py-3 max-w-[140px] truncate">
                        {r.recipient}
                      </td>
                      <td className="px-4 py-3 max-w-[180px] truncate">
                        {r.subject}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3">{r.retry_count}</td>
                      <td className="px-4 py-3">
                        {r.status === "failed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void retryOne(r.id)}
                          >
                            Retry
                          </Button>
                        )}
                        {r.meta?.messageId || r.meta?.externalId ? (
                          <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                            {String(r.meta.messageId || r.meta.externalId)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground">{total} total</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="px-2 py-1 text-muted-foreground">Page {page}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={page * 20 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Bell;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {hint && (
            <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "sent" || status === "delivered"
      ? "success"
      : status === "failed"
        ? "danger"
        : status === "skipped"
          ? "secondary"
          : "warning";
  return (
    <Badge variant={variant as "success"} className="capitalize">
      {status}
    </Badge>
  );
}

function csvEscape(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
