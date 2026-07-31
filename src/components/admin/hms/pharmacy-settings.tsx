"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { PharmacySettings } from "@/lib/pharmacy/types";

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
        checked ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/40"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span>{label}</span>
      <span className={`h-4 w-4 rounded-full border ${checked ? "border-primary bg-primary" : "border-border"}`} />
    </button>
  );
}

export function PharmacySettingsView() {
  const [settings, setSettings] = useState<PharmacySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setBusy(true);
    fetch("/api/admin/pharmacy/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.data) setSettings(j.data as PharmacySettings);
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setBusy(false));
  };

  useEffect(load, []);

  const set = <K extends keyof PharmacySettings>(key: K, value: PharmacySettings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/pharmacy/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save settings");
      setSettings(json.data as PharmacySettings);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  if (busy || !settings) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  const receiptToggles: [keyof PharmacySettings, string][] = [
    ["show_logo", "Logo"],
    ["show_hospital_address", "Hospital address"],
    ["show_phone", "Phone"],
    ["show_gst", "GST number"],
    ["show_drug_license", "Drug license"],
    ["show_doctor_name", "Doctor name"],
    ["show_batch_details", "Batch details"],
    ["show_expiry", "Expiry date"],
    ["show_mrp", "MRP"],
    ["show_barcode", "Barcode"],
    ["show_qr_code", "QR code"],
    ["show_return_policy", "Return policy"],
  ];

  const paymentToggles: [keyof PharmacySettings, string][] = [
    ["enable_cash", "Cash"],
    ["enable_upi", "UPI (G Pay / PhonePe / Paytm)"],
    ["enable_card", "Credit / Debit Card"],
    ["enable_insurance", "Insurance"],
    ["enable_wallet", "Wallet"],
    ["enable_credit", "Credit Sales"],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 font-semibold">Payment Methods</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {paymentToggles.map(([key, label]) => (
              <Toggle
                key={String(key)}
                label={label}
                checked={Boolean(settings[key])}
                onChange={(v) => set(key, v as never)}
                disabled={key === "enable_credit" && !settings.allow_credit_sales}
              />
            ))}
          </div>
          <div className="mt-3">
            <Toggle
              label="Allow credit sales (enables Credit method)"
              checked={Boolean(settings.allow_credit_sales)}
              onChange={(v) => {
                set("allow_credit_sales", v as never);
                if (!v) set("enable_credit", false as never);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 font-semibold">Receipt Content</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {receiptToggles.map(([key, label]) => (
              <Toggle
                key={String(key)}
                label={label}
                checked={Boolean(settings[key])}
                onChange={(v) => set(key, v as never)}
              />
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Receipt footer</Label>
              <Input className="mt-1" value={settings.receipt_footer || ""} onChange={(e) => set("receipt_footer", e.target.value)} />
            </div>
            <div>
              <Label>Return policy text</Label>
              <Input className="mt-1" value={settings.return_policy_text || ""} onChange={(e) => set("return_policy_text", e.target.value)} />
            </div>
            <div>
              <Label>Paper size</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={settings.receipt_paper_size}
                onChange={(e) => set("receipt_paper_size", e.target.value as PharmacySettings["receipt_paper_size"])}
              >
                <option value="58mm">58mm Thermal</option>
                <option value="80mm">80mm Thermal</option>
                <option value="A4">A4 Invoice</option>
              </select>
            </div>
            <div>
              <Label>Default GST (%)</Label>
              <Input className="mt-1" type="number" min={0} max={100} value={settings.default_gst_percent} onChange={(e) => set("default_gst_percent", Number(e.target.value) || 0)} />
            </div>
            <div>
              <Toggle
                label="Inclusive tax (MRP includes GST)"
                checked={Boolean(settings.inclusive_tax)}
                onChange={(v) => set("inclusive_tax", v as never)}
              />
            </div>
            <div>
              <Label>Max discount (%)</Label>
              <Input className="mt-1" type="number" min={0} max={100} value={settings.max_discount_percent} onChange={(e) => set("max_discount_percent", Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Low stock threshold</Label>
              <Input className="mt-1" type="number" min={0} value={settings.low_stock_threshold} onChange={(e) => set("low_stock_threshold", Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Expiry alert (days)</Label>
              <Input className="mt-1" type="number" min={0} value={settings.expiry_alert_days} onChange={(e) => set("expiry_alert_days", Number(e.target.value) || 0)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">License & Compliance</h3>
            <Toggle
              label="Standalone mode"
              checked={Boolean(settings.standalone_mode)}
              onChange={(v) => set("standalone_mode", v as never)}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Standalone runs the pharmacy without requiring hospital modules (walk-in only).
            Integrated mode uses the full hospital ERP.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>GST number</Label>
              <Input className="mt-1" value={settings.gst_number || ""} onChange={(e) => set("gst_number", e.target.value)} />
            </div>
            <div>
              <Label>Drug license number</Label>
              <Input className="mt-1" value={settings.drug_license_number || ""} onChange={(e) => set("drug_license_number", e.target.value)} />
            </div>
            <div>
              <Label>Pharmacist name</Label>
              <Input className="mt-1" value={settings.pharmacist_name || ""} onChange={(e) => set("pharmacist_name", e.target.value)} />
            </div>
            <div>
              <Label>Pharmacist registration</Label>
              <Input className="mt-1" value={settings.pharmacist_registration || ""} onChange={(e) => set("pharmacist_registration", e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save settings
            </Button>
            <Badge variant="outline">Changes apply to receipts & POS instantly</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
