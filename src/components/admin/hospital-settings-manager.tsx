"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Save, Building2, Puzzle, Palette, CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { HospitalConfig } from "@/lib/hospital/types";
import { HOSPITAL_TYPES, MODULE_KEYS } from "@/lib/hospital/types";
import { buildDefaultHospitalConfig } from "@/lib/hospital/defaults";

type Tab =
  | "identity"
  | "branding"
  | "contact"
  | "modules"
  | "payments"
  | "auth"
  | "prefixes"
  | "legal"
  | "templates"
  | "data";

export function HospitalSettingsManager() {
  const [tab, setTab] = useState<Tab>("identity");
  const [config, setConfig] = useState<HospitalConfig>(
    buildDefaultHospitalConfig()
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hospital-settings", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Load failed");
      setConfig(json.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hospital-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: config.branding.name,
          hospital_type: config.hospital_type,
          branding: config.branding,
          contact: config.contact,
          localization: config.localization,
          legal: config.legal,
          modules: config.modules,
          prefixes: config.prefixes,
          payments: config.payments,
          email: config.email,
          storage: config.storage,
          auth_providers: config.auth_providers,
          templates: config.templates,
          seo: config.seo,
          social: config.social,
          working_hours: config.working_hours,
          data_management: config.data_management,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setConfig(json.data);
      toast.success("Hospital settings saved — no redeploy required");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "identity", label: "Identity" },
    { id: "branding", label: "Branding" },
    { id: "contact", label: "Contact" },
    { id: "modules", label: "Modules" },
    { id: "payments", label: "Payments" },
    { id: "auth", label: "Auth" },
    { id: "prefixes", label: "Prefixes" },
    { id: "legal", label: "Legal & Tax" },
    { id: "templates", label: "Templates" },
    { id: "data", label: "Data" },
  ];

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading hospital config…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Building2 className="h-5 w-5 text-primary-600" />
            Hospital configuration
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-hospital SaaS settings — change branding, modules, payments,
            and prefixes without code changes. Source:{" "}
            <Badge variant="secondary">{config.source}</Badge> · slug{" "}
            <code className="text-xs">{config.slug}</code>
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save all
        </Button>
      </div>

      <div
        className="flex flex-wrap gap-1 rounded-xl bg-muted p-1"
        role="tablist"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm ${
              tab === t.id
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "identity" && (
        <Card>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <Field label="Hospital name">
              <Input
                value={config.branding.name}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    branding: { ...config.branding, name: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Hospital type">
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={config.hospital_type}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hospital_type: e.target
                      .value as HospitalConfig["hospital_type"],
                  })
                }
              >
                {HOSPITAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tagline">
              <Input
                value={config.branding.tagline}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    branding: { ...config.branding, tagline: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Timezone">
              <Input
                value={config.localization.timezone}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    localization: {
                      ...config.localization,
                      timezone: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Currency">
              <Input
                value={config.localization.currency}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    localization: {
                      ...config.localization,
                      currency: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Language">
              <Input
                value={config.localization.language}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    localization: {
                      ...config.localization,
                      language: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="OPD timings">
              <Input
                value={config.working_hours.opd}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    working_hours: {
                      ...config.working_hours,
                      opd: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Emergency timings">
              <Input
                value={config.working_hours.emergency}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    working_hours: {
                      ...config.working_hours,
                      emergency: e.target.value,
                    },
                  })
                }
              />
            </Field>
          </CardContent>
        </Card>
      )}

      {tab === "branding" && (
        <Card>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <div className="flex items-center gap-2 sm:col-span-2">
              <Palette className="h-4 w-4 text-primary-600" />
              <span className="text-sm font-semibold">
                Live CSS variables: --hospital-primary / --hospital-secondary
              </span>
            </div>
            <Field label="Primary color">
              <Input
                type="color"
                value={config.branding.primary_color}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    branding: {
                      ...config.branding,
                      primary_color: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Secondary color">
              <Input
                type="color"
                value={config.branding.secondary_color}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    branding: {
                      ...config.branding,
                      secondary_color: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Logo URL">
              <Input
                value={config.branding.logo_url}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    branding: { ...config.branding, logo_url: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Favicon URL">
              <Input
                value={config.branding.favicon_url}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    branding: {
                      ...config.branding,
                      favicon_url: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Banner URL">
              <Input
                value={config.branding.banner_url}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    branding: {
                      ...config.branding,
                      banner_url: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Watermark URL">
              <Input
                value={config.branding.watermark_url}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    branding: {
                      ...config.branding,
                      watermark_url: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="SEO title">
              <Input
                value={config.seo.meta_title}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    seo: { ...config.seo, meta_title: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="SEO description">
              <Input
                value={config.seo.meta_description}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    seo: { ...config.seo, meta_description: e.target.value },
                  })
                }
              />
            </Field>
          </CardContent>
        </Card>
      )}

      {tab === "contact" && (
        <Card>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <Field label="Email">
              <Input
                value={config.contact.email}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, email: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Support email">
              <Input
                value={config.contact.support_email}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: {
                      ...config.contact,
                      support_email: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Billing email">
              <Input
                value={config.contact.billing_email}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: {
                      ...config.contact,
                      billing_email: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="WhatsApp (with country code)">
              <Input
                value={config.contact.whatsapp}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, whatsapp: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Emergency phone">
              <Input
                value={config.contact.emergency_phone}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: {
                      ...config.contact,
                      emergency_phone: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Phones (comma-separated)">
              <Input
                value={config.contact.phones.join(", ")}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: {
                      ...config.contact,
                      phones: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </Field>
            <Field label="Address line 1">
              <Input
                value={config.contact.address_line1}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: {
                      ...config.contact,
                      address_line1: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="City">
              <Input
                value={config.contact.city}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, city: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="State">
              <Input
                value={config.contact.state}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, state: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="PIN">
              <Input
                value={config.contact.pincode}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, pincode: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Website">
              <Input
                value={config.contact.website}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, website: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Google Maps URL">
              <Input
                value={config.contact.maps_url}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, maps_url: e.target.value },
                  })
                }
              />
            </Field>
          </CardContent>
        </Card>
      )}

      {tab === "modules" && (
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Puzzle className="h-4 w-4" />
              Enable / disable modules (no code deploy)
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MODULE_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border"
                    checked={Boolean(config.modules[key])}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        modules: {
                          ...config.modules,
                          [key]: e.target.checked,
                        },
                      })
                    }
                  />
                  <span className="capitalize">{key.replace(/_/g, " ")}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "payments" && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4" /> Payment methods
            </div>
            <p className="text-xs text-muted-foreground">
              API keys stay in environment variables. These flags control which
              methods appear in the UI.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["razorpay_enabled", "Razorpay"],
                  ["stripe_enabled", "Stripe"],
                  ["paypal_enabled", "PayPal"],
                  ["cash_enabled", "Cash"],
                  ["upi_enabled", "UPI"],
                  ["bank_transfer_enabled", "Bank transfer"],
                  ["insurance_enabled", "Insurance"],
                  ["custom_gateway_enabled", "Custom gateway"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={Boolean(config.payments[key])}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        payments: {
                          ...config.payments,
                          [key]: e.target.checked,
                        },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <Field label="UPI ID">
              <Input
                value={config.payments.upi_id}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    payments: { ...config.payments, upi_id: e.target.value },
                  })
                }
              />
            </Field>
          </CardContent>
        </Card>
      )}

      {tab === "auth" && (
        <Card>
          <CardContent className="grid gap-2 p-6 sm:grid-cols-2">
            {(
              [
                ["email_login", "Email login"],
                ["phone_login", "Phone login"],
                ["otp_login", "OTP"],
                ["google_login", "Google"],
                ["microsoft_login", "Microsoft"],
                ["apple_login", "Apple"],
                ["magic_link", "Magic link"],
                ["mfa", "MFA"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={Boolean(config.auth_providers[key])}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      auth_providers: {
                        ...config.auth_providers,
                        [key]: e.target.checked,
                      },
                    })
                  }
                />
                {label}
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "prefixes" && (
        <Card>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
            {(
              Object.keys(config.prefixes) as (keyof typeof config.prefixes)[]
            ).map((key) => (
              <Field key={key} label={key.replace(/_/g, " ")}>
                <Input
                  value={config.prefixes[key]}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      prefixes: {
                        ...config.prefixes,
                        [key]: e.target.value,
                      },
                    })
                  }
                />
              </Field>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "legal" && (
        <Card>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <Field label="Tax %">
              <Input
                type="number"
                value={config.legal.tax_percent}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    legal: {
                      ...config.legal,
                      tax_percent: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </Field>
            <Field label="GST number">
              <Input
                value={config.legal.gst_number}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    legal: { ...config.legal, gst_number: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="PAN">
              <Input
                value={config.legal.pan_number}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    legal: { ...config.legal, pan_number: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="License">
              <Input
                value={config.legal.license_number}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    legal: {
                      ...config.legal,
                      license_number: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Registration no.">
              <Input
                value={config.legal.registration_number}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    legal: {
                      ...config.legal,
                      registration_number: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="NABH">
              <Input
                value={config.legal.nabh_number}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    legal: { ...config.legal, nabh_number: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="NABL">
              <Input
                value={config.legal.nabl_number}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    legal: { ...config.legal, nabl_number: e.target.value },
                  })
                }
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Footer text">
                <Textarea
                  value={config.legal.footer_text}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      legal: { ...config.legal, footer_text: e.target.value },
                    })
                  }
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "templates" && (
        <Card>
          <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            {(
              Object.keys(config.templates) as (keyof typeof config.templates)[]
            ).map((key) => (
              <Field key={key} label={key.replace(/_/g, " ")}>
                <Textarea
                  value={config.templates[key]}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      templates: {
                        ...config.templates,
                        [key]: e.target.value,
                      },
                    })
                  }
                  className="min-h-[72px]"
                />
              </Field>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "data" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              <Field label="Data Management enabled">
                <Toggle
                  checked={config.data_management.enabled}
                  onChange={(v) =>
                    setConfig({
                      ...config,
                      data_management: { ...config.data_management, enabled: v },
                    })
                  }
                />
              </Field>
              <Field label="Duplicate handling">
                <select
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={config.data_management.duplicateMode}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      data_management: {
                        ...config.data_management,
                        duplicateMode: e.target.value as "update" | "skip",
                      },
                    })
                  }
                >
                  <option value="update">Update existing records</option>
                  <option value="skip">Skip existing records</option>
                </select>
              </Field>
              <Field label="Max upload size (MB)">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={config.data_management.maxFileSizeMB}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      data_management: {
                        ...config.data_management,
                        maxFileSizeMB: Number(e.target.value) || 1,
                      },
                    })
                  }
                />
              </Field>
              <Field label="Allowed formats">
                <div className="space-y-1.5">
                  {["xlsx", "xls", "csv"].map((fmt) => (
                    <label
                      key={fmt}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={config.data_management.allowedFormats.includes(fmt)}
                        onChange={(e) => {
                          const cur = config.data_management.allowedFormats;
                          const next = e.target.checked
                            ? [...cur, fmt]
                            : cur.filter((f) => f !== fmt);
                          setConfig({
                            ...config,
                            data_management: {
                              ...config.data_management,
                              allowedFormats: next,
                            },
                          });
                        }}
                      />
                      .{fmt}
                    </label>
                  ))}
                </div>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <h3 className="mb-1 text-sm font-semibold">Backups</h3>
                <p className="text-xs text-muted-foreground">
                  Backup metadata is stored per tenant; schedule expression is
                  consumed by your serverless cron / scheduler.
                </p>
              </div>
              <Field label="Automatic backups enabled">
                <Toggle
                  checked={config.data_management.backup.enabled}
                  onChange={(v) =>
                    setConfig({
                      ...config,
                      data_management: {
                        ...config.data_management,
                        backup: { ...config.data_management.backup, enabled: v },
                      },
                    })
                  }
                />
              </Field>
              <Field label="Schedule (cron expression)">
                <Input
                  placeholder="0 2 * * *"
                  value={config.data_management.backup.scheduleCron || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      data_management: {
                        ...config.data_management,
                        backup: {
                          ...config.data_management.backup,
                          scheduleCron: e.target.value || null,
                        },
                      },
                    })
                  }
                />
              </Field>
              <Field label="Backups to keep">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={config.data_management.backup.keepCount}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      data_management: {
                        ...config.data_management,
                        backup: {
                          ...config.data_management.backup,
                          keepCount: Number(e.target.value) || 5,
                        },
                      },
                    })
                  }
                />
              </Field>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
        checked ? "bg-primary-600" : "bg-muted"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}
