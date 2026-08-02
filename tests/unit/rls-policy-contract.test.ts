import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RLS regression contract for migration 046 (critical security hardening).
 * Guards against someone reverting the hardened policies (item 1/2/4/6/7).
 * The SQL file itself is the single source of truth for the deployed schema.
 */

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "046_critical_security_hardening.sql"
);

function sql(): string {
  assert.ok(existsSync(MIGRATION), `missing ${MIGRATION}`);
  return readFileSync(MIGRATION, "utf8");
}

function has(sqlText: string, needle: string): boolean {
  return sqlText.includes(needle);
}

describe("migration 046 RLS contract", () => {
  const text = sql();

  it("adds is_hospital_staff() helper covering all 11 staff roles", () => {
    assert.ok(has(text, "create or replace function public.is_hospital_staff()"));
    for (const role of [
      "super_admin",
      "admin",
      "doctor",
      "receptionist",
      "lab_technician",
      "radiology_technician",
      "pharmacist",
      "billing",
      "finance",
      "hr",
      "manager",
    ]) {
      assert.ok(has(text, `'${role}'`), `missing role ${role}`);
    }
  });

  it("adds public booked_slots RPC (schedule-only, no PHI)", () => {
    assert.ok(has(text, "create or replace function public.booked_slots("));
    assert.ok(has(text, "grant execute on function public.booked_slots(text, date) to anon"));
  });

  describe("item 1 — appointments RLS", () => {
    it("removes anonymous PII read", () => {
      assert.ok(
        has(text, 'drop policy if exists "Appointments: public read schedule"'),
        "anonymous read must be dropped"
      );
    });

    it("removes unrestricted public insert", () => {
      assert.ok(has(text, 'drop policy if exists "Appointments: public insert"'));
    });

    it("restricts public insert to contact fields only", () => {
      assert.ok(has(text, 'create policy "Appointments: public book"'));
      assert.ok(
        has(text, "coalesce(status, 'pending') in ('pending', 'confirmed')"),
        "anon must not set arbitrary status"
      );
      assert.ok(
        has(text, "coalesce(payment_status, 'pending') = 'pending'"),
        "anon must not mark paid"
      );
      assert.ok(has(text, "is_walk_in is not true"), "anon must not create walk-ins");
      assert.ok(has(text, "invoice_id is null"), "anon must not link invoices");
      assert.ok(
        has(text, "hospital_id = public.default_hospital_id()"),
        "anon bookings stay in the default hospital"
      );
    });

    it("scopes staff reads to their hospital", () => {
      assert.ok(has(text, 'create policy "Appointments: staff select tenant"'));
      assert.ok(has(text, "public.is_hospital_staff()"));
    });

    it("limits patients to their own rows", () => {
      assert.ok(has(text, 'create policy "Appointments: patient read own"'));
      assert.ok(has(text, "not public.is_hospital_staff()"));
    });
  });

  describe("item 2 — billing RLS", () => {
    it("drops blanket authenticated policies on invoices", () => {
      assert.ok(has(text, 'drop policy if exists "Invoices: authenticated select"'));
      assert.ok(has(text, 'drop policy if exists "Invoices: authenticated update"'));
      assert.ok(has(text, "drop policy if exists invoices_tenant_select_v2 on public.invoices"));
    });

    it("drops blanket authenticated policies on payments", () => {
      for (const p of ["select", "insert", "update", "delete"]) {
        assert.ok(
          has(text, `drop policy if exists payments_authenticated_${p} on public.payments`),
          `payments_authenticated_${p} must be dropped`
        );
      }
    });

    it("drops audit-log and settings tenant policies", () => {
      assert.ok(
        has(text, "drop policy if exists payment_audit_logs_authenticated_select on public.payment_audit_logs")
      );
      assert.ok(
        has(text, "drop policy if exists payment_settings_tenant_select_v2 on public.payment_settings")
      );
    });

    it("grants staff-scoped policies on invoices/payments/audit/settings", () => {
      for (const table of ["Invoices", "Payments", "Payment audit", "Payment settings"]) {
        assert.ok(
          has(text, `create policy "${table}: staff`),
          `missing staff policy for ${table}`
        );
      }
    });
  });

  describe("item 4 — private invoices bucket", () => {
    it("makes the bucket private", () => {
      assert.ok(has(text, "update storage.buckets"));
      assert.ok(has(text, "set public = false"));
      assert.ok(has(text, "where id = 'invoices'"));
    });

    it("drops public read and open authenticated insert", () => {
      assert.ok(has(text, "drop policy if exists invoices_storage_public_read on storage.objects"));
      assert.ok(
        has(text, "drop policy if exists invoices_storage_authenticated_insert on storage.objects")
      );
    });

    it("scopes storage access to staff", () => {
      assert.ok(has(text, 'create policy "Invoices: staff read"'));
      assert.ok(has(text, 'create policy "Invoices: staff insert"'));
    });
  });

  describe("item 6 — hospital_id on patient PHI tables", () => {
    it("adds + backfills + requires hospital_id", () => {
      assert.ok(
        has(text, "alter table public.patient_reports\n  add column if not exists hospital_id")
      );
      assert.ok(
        has(text, "alter table public.patient_notifications\n  add column if not exists hospital_id")
      );
      assert.ok(has(text, "alter column hospital_id set not null"));
    });
  });

  describe("item 7 — pharmacy GUC policies replaced", () => {
    it("drops the app.current_hospital_id GUC policies", () => {
      // Built dynamically in the DO block: format('drop policy if exists %I ...', t || '_tenant')
      assert.ok(has(text, "execute format('drop policy if exists %I on public.%I', t || '_tenant', t)"));
      const loopTables = [
        "pharmacy_branches",
        "pharmacy_shifts",
        "pharmacy_settings",
        "pharmacy_returns",
        "pharmacy_return_items",
        "pharmacy_audit_log",
        "pharmacy_held_bills",
      ];
      loopTables.forEach((t, i) => {
        const needle =
          i === loopTables.length - 1 ? `'${t}'` : `'${t}',`;
        assert.ok(has(text, needle), `table ${t} must be in the pharmacy policy loop`);
      });
    });

    it("recreates them with current_hospital_id() + staff scope", () => {
      assert.ok(has(text, "t || '_tenant_staff'"));
      assert.ok(has(text, "public.current_hospital_id()"));
      assert.ok(has(text, "public.is_hospital_staff()"));
      assert.ok(has(text, "public.pharmacy_returns r"));
    });
  });
});
