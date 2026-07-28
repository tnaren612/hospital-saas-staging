/**
 * NotificationRepository — Supabase when available, in-memory fallback for local/demo.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getServiceRoleKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";
import type { NotificationRepository } from "@/lib/notifications/core/interfaces";
import type {
  NotificationListQuery,
  NotificationPreferences,
  NotificationRecord,
  NotificationStats,
  NotificationStatus,
  NotificationChannel,
  NotificationProviderId,
} from "@/lib/notifications/core/types";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
} from "@/lib/notifications/core/preferences";

const memoryStore: NotificationRecord[] = [];
const memoryPrefs = new Map<string, NotificationPreferences>();

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function mapRow(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    patient_id: row.patient_id ? String(row.patient_id) : null,
    appointment_id: row.appointment_id ? String(row.appointment_id) : null,
    channel: (row.channel as NotificationChannel) || "email",
    provider: (row.provider as NotificationProviderId) || "none",
    recipient: String(row.recipient || ""),
    subject: String(row.subject || ""),
    message: String(row.message || ""),
    html: row.html ? String(row.html) : undefined,
    status: (row.status as NotificationStatus) || "pending",
    error_message: String(row.error_message || ""),
    retry_count: Number(row.retry_count) || 0,
    template_id: String(row.template_id || "generic"),
    meta: (row.meta || {}) as Record<string, unknown>,
    sent_at: row.sent_at ? String(row.sent_at) : null,
    created_at: String(row.created_at || nowIso()),
    updated_at: String(row.updated_at || nowIso()),
  };
}

function serviceClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey() || getSupabaseAnonKey();
  if (!url || !key || !hasSupabaseConfig()) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class InMemoryNotificationRepository implements NotificationRepository {
  async create(
    partial: Omit<NotificationRecord, "id" | "created_at" | "updated_at"> & {
      id?: string;
    }
  ): Promise<NotificationRecord> {
    const ts = nowIso();
    const row: NotificationRecord = {
      id: partial.id || newId(),
      patient_id: partial.patient_id ?? null,
      appointment_id: partial.appointment_id ?? null,
      channel: partial.channel,
      provider: partial.provider,
      recipient: partial.recipient,
      subject: partial.subject,
      message: partial.message,
      html: partial.html,
      status: partial.status,
      error_message: partial.error_message || "",
      retry_count: partial.retry_count || 0,
      template_id: partial.template_id || "generic",
      meta: partial.meta || {},
      sent_at: partial.sent_at ?? null,
      created_at: ts,
      updated_at: ts,
    };
    memoryStore.unshift(row);
    if (memoryStore.length > 2000) memoryStore.length = 2000;
    return row;
  }

  async update(
    id: string,
    patch: Partial<NotificationRecord>
  ): Promise<NotificationRecord | null> {
    const idx = memoryStore.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    memoryStore[idx] = {
      ...memoryStore[idx],
      ...patch,
      id: memoryStore[idx].id,
      updated_at: nowIso(),
    };
    return memoryStore[idx];
  }

  async findById(id: string): Promise<NotificationRecord | null> {
    return memoryStore.find((r) => r.id === id) || null;
  }

  async list(
    query: NotificationListQuery
  ): Promise<{ data: NotificationRecord[]; total: number }> {
    let rows = [...memoryStore];
    if (query.channel) rows = rows.filter((r) => r.channel === query.channel);
    if (query.status) rows = rows.filter((r) => r.status === query.status);
    if (query.provider)
      rows = rows.filter((r) => r.provider === query.provider);
    if (query.q) {
      const q = query.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.recipient.toLowerCase().includes(q) ||
          r.subject.toLowerCase().includes(q) ||
          r.message.toLowerCase().includes(q)
      );
    }
    const total = rows.length;
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const start = (page - 1) * pageSize;
    return { data: rows.slice(start, start + pageSize), total };
  }

  async stats(): Promise<NotificationStats> {
    const all = memoryStore;
    return computeStats(all);
  }

  async getPreferences(
    patientId: string
  ): Promise<NotificationPreferences | null> {
    return memoryPrefs.get(patientId) || null;
  }

  async savePreferences(
    patientId: string,
    prefs: NotificationPreferences
  ): Promise<NotificationPreferences> {
    const n = normalizePreferences({ ...prefs, patient_id: patientId });
    memoryPrefs.set(patientId, n);
    return n;
  }

  async listRetryable(limit = 50): Promise<NotificationRecord[]> {
    return memoryStore
      .filter((r) => r.status === "failed" && r.retry_count < 5)
      .slice(0, limit);
  }
}

export class SupabaseNotificationRepository implements NotificationRepository {
  constructor(private sb: SupabaseClient) {}

  async create(
    partial: Omit<NotificationRecord, "id" | "created_at" | "updated_at"> & {
      id?: string;
    }
  ): Promise<NotificationRecord> {
    const insert = {
      patient_id: partial.patient_id,
      appointment_id: partial.appointment_id,
      channel: partial.channel,
      provider: partial.provider,
      recipient: partial.recipient,
      subject: partial.subject,
      message: partial.message,
      html: partial.html || "",
      status: partial.status,
      error_message: partial.error_message || "",
      retry_count: partial.retry_count || 0,
      template_id: partial.template_id,
      meta: partial.meta || {},
      sent_at: partial.sent_at,
    };
    const { data, error } = await this.sb
      .from("notifications")
      .insert(insert)
      .select("*")
      .single();

    if (error || !data) {
      // Fallback memory if table missing
      const mem = new InMemoryNotificationRepository();
      return mem.create(partial);
    }
    return mapRow(data as Record<string, unknown>);
  }

  async update(
    id: string,
    patch: Partial<NotificationRecord>
  ): Promise<NotificationRecord | null> {
    const body: Record<string, unknown> = {
      updated_at: nowIso(),
    };
    const keys: (keyof NotificationRecord)[] = [
      "status",
      "error_message",
      "retry_count",
      "sent_at",
      "provider",
      "meta",
      "subject",
      "message",
      "html",
    ];
    for (const k of keys) {
      if (patch[k] !== undefined) body[k] = patch[k];
    }

    const { data, error } = await this.sb
      .from("notifications")
      .update(body)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error || !data) return null;
    return mapRow(data as Record<string, unknown>);
  }

  async findById(id: string): Promise<NotificationRecord | null> {
    const { data, error } = await this.sb
      .from("notifications")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as Record<string, unknown>);
  }

  async list(
    query: NotificationListQuery
  ): Promise<{ data: NotificationRecord[]; total: number }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = this.sb
      .from("notifications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (query.channel) q = q.eq("channel", query.channel);
    if (query.status) q = q.eq("status", query.status);
    if (query.provider) q = q.eq("provider", query.provider);
    if (query.q) {
      q = q.or(
        `recipient.ilike.%${query.q}%,subject.ilike.%${query.q}%,message.ilike.%${query.q}%`
      );
    }

    const { data, error, count } = await q.range(from, to);
    if (error) {
      return { data: [], total: 0 };
    }
    return {
      data: (data || []).map((r) => mapRow(r as Record<string, unknown>)),
      total: count || 0,
    };
  }

  async stats(): Promise<NotificationStats> {
    const { data } = await this.sb
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    const rows = (data || []).map((r) => mapRow(r as Record<string, unknown>));
    return computeStats(rows);
  }

  async getPreferences(
    patientId: string
  ): Promise<NotificationPreferences | null> {
    const { data, error } = await this.sb
      .from("notification_preferences")
      .select("*")
      .eq("patient_id", patientId)
      .maybeSingle();
    if (error || !data) return null;
    return normalizePreferences({
      patient_id: patientId,
      email: data.email !== false,
      whatsapp: data.whatsapp !== false,
      sms: Boolean(data.sms),
      all: Boolean(data.all_channels),
    });
  }

  async savePreferences(
    patientId: string,
    prefs: NotificationPreferences
  ): Promise<NotificationPreferences> {
    const n = normalizePreferences({ ...prefs, patient_id: patientId });
    const { error } = await this.sb.from("notification_preferences").upsert(
      {
        patient_id: patientId,
        email: n.email,
        whatsapp: n.whatsapp,
        sms: n.sms,
        all_channels: n.all,
        updated_at: nowIso(),
      },
      { onConflict: "patient_id" }
    );
    if (error) {
      memoryPrefs.set(patientId, n);
    }
    return n;
  }

  async listRetryable(limit = 50): Promise<NotificationRecord[]> {
    const { data } = await this.sb
      .from("notifications")
      .select("*")
      .eq("status", "failed")
      .lt("retry_count", 5)
      .order("updated_at", { ascending: true })
      .limit(limit);
    return (data || []).map((r) => mapRow(r as Record<string, unknown>));
  }
}

function computeStats(all: NotificationRecord[]): NotificationStats {
  const by_channel: Record<string, number> = {};
  const by_status: Record<string, number> = {};
  let emails_sent = 0;
  let whatsapp_generated = 0;
  let sms_pending = 0;
  let sms_sent = 0;
  let failures = 0;
  let retries = 0;
  let successes = 0;

  for (const r of all) {
    by_channel[r.channel] = (by_channel[r.channel] || 0) + 1;
    by_status[r.status] = (by_status[r.status] || 0) + 1;
    if (r.channel === "email" && (r.status === "sent" || r.status === "delivered"))
      emails_sent++;
    if (r.channel === "whatsapp" && r.status !== "failed") whatsapp_generated++;
    if (r.channel === "sms" && r.status === "pending") sms_pending++;
    if (r.channel === "sms" && (r.status === "sent" || r.status === "delivered"))
      sms_sent++;
    if (r.status === "failed") failures++;
    retries += r.retry_count || 0;
    if (r.status === "sent" || r.status === "delivered") successes++;
  }

  const total = all.length;
  const success_rate = total ? Math.round((successes / total) * 1000) / 10 : 0;
  let most_used_channel: NotificationChannel | "none" = "none";
  let max = 0;
  for (const [ch, n] of Object.entries(by_channel)) {
    if (n > max) {
      max = n;
      most_used_channel = ch as NotificationChannel;
    }
  }

  return {
    total,
    emails_sent,
    whatsapp_generated,
    sms_pending: sms_pending + (by_status.queued || 0),
    sms_sent,
    failures,
    retries,
    success_rate,
    most_used_channel,
    by_channel,
    by_status,
    recent: all.slice(0, 10),
  };
}

let repoSingleton: NotificationRepository | null = null;

export function getNotificationRepository(): NotificationRepository {
  if (repoSingleton) return repoSingleton;
  const sb = serviceClient();
  repoSingleton = sb
    ? new SupabaseNotificationRepository(sb)
    : new InMemoryNotificationRepository();
  return repoSingleton;
}

/** Test helper */
export function resetNotificationRepositoryForTests(
  repo?: NotificationRepository
) {
  repoSingleton = repo || new InMemoryNotificationRepository();
  memoryStore.length = 0;
  memoryPrefs.clear();
}

export { DEFAULT_PREFERENCES };
