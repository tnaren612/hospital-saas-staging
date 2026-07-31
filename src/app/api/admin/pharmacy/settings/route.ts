import { NextResponse } from "next/server";
import { requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { rolesForPhase2Module } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import {
  getPharmacySettings,
  updatePharmacySettings,
} from "@/lib/pharmacy/service";

export const dynamic = "force-dynamic";

/**
 * Coerce loose scalar values so a malformed client cannot push wrong shapes
 * into the typed pharmacy_settings row.
 */
function sanitizePatch(raw: Record<string, unknown>): Record<string, unknown> {
  const BOOL_KEYS = [
    "show_logo", "show_hospital_address", "show_phone", "show_gst",
    "show_drug_license", "show_doctor_name", "show_patient_address",
    "show_batch_details", "show_expiry", "show_mrp", "show_savings",
    "show_barcode", "show_qr_code", "show_return_policy", "inclusive_tax",
    "require_discount_approval", "enable_barcode_scanner",
    "enable_keyboard_shortcuts", "enable_sound_effects", "auto_print_receipt",
    "require_patient_for_sale", "allow_credit_sales", "enable_cash",
    "enable_upi", "enable_card", "enable_insurance", "enable_credit",
    "enable_wallet", "standalone_mode",
  ];
  const NUM_KEYS = [
    "default_gst_percent", "max_discount_percent", "low_stock_threshold",
    "expiry_alert_days", "critical_expiry_days",
  ];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    if (BOOL_KEYS.includes(key)) {
      out[key] = value === true || value === "true" || value === 1 || value === "1";
    } else if (NUM_KEYS.includes(key)) {
      const n = Number(value);
      out[key] = Number.isFinite(n) ? n : undefined;
      if (out[key] === undefined) delete out[key];
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export async function GET() {
  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;
  const tenant = await getTenantContext();
  const settings = await getPharmacySettings({ hospitalId: tenant.hospitalId });
  return NextResponse.json({ data: settings });
}

export async function PATCH(request: Request) {
  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;
  const tenant = await getTenantContext();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Empty patch" }, { status: 400 });
  }
  const patch = sanitizePatch(body);
  const settings = await updatePharmacySettings(patch, {
    hospitalId: tenant.hospitalId,
  });
  return NextResponse.json({ data: settings });
}
