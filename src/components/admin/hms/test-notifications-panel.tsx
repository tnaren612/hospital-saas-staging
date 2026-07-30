"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Mail, MessageCircle, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useHospitalConfig } from "@/components/hospital/hospital-config-provider";

const TEMPLATES = [
  "welcome",
  "appointment_confirmation",
  "appointment_reminder",
  "appointment_cancelled",
  "appointment_rescheduled",
  "payment_success",
  "payment_failed",
  "invoice",
  "password_reset",
  "lab_report_ready",
  "prescription_ready",
  "emergency",
  "patient_registration",
  "generic",
];

export function TestNotificationsPanel() {
  const { config } = useHospitalConfig();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [templateId, setTemplateId] = useState("appointment_confirmation");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(
    null
  );
  const [waMessageId, setWaMessageId] = useState("");
  const [smsPreview, setSmsPreview] = useState("");

  const sampleVars = {
    patientName: "Test Patient",
    doctorName: "Test Doctor",
    departmentName: "Test Department",
    date: "2026-08-01",
    timeSlot: "10:00 AM",
    type: "in-person",
    bookingRef: `${config.prefixes.appointment}-TEST-001`,
    invoiceNumber: `${config.prefixes.invoice}-1001`,
    amount: "500",
    amountLabel: "Rs 500.00",
    paymentMethod: "UPI",
    hospitalName: config.branding.name,
    message: "This is a test notification from admin.",
    window: "24h",
  };

  const send = async (channel: "email" | "whatsapp" | "sms") => {
    const recipient = channel === "email" ? email : phone;
    if (!recipient) {
      toast.error(channel === "email" ? "Enter email" : "Enter phone");
      return;
    }
    setBusy(channel);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          templateId,
          recipient,
          vars: sampleVars,
          force: true,
        }),
      });
      const json = await res.json();
      setLastResult(json);
      if (channel === "whatsapp") {
        setWaMessageId(
          String(json.messageId || json.notificationId || json.status || "")
        );
      }
      if (json.preview && channel === "sms") setSmsPreview(String(json.preview));
      if (!res.ok || json.ok === false) {
        toast.error(json.error || "Send failed");
      } else {
        toast.success(`${channel} OK (${json.provider || "provider"})`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Test Notifications"
        description="Send test email (Gmail/Resend/mock), Meta WhatsApp Cloud API, preview SMS"
        actions={
          <Link href="/admin/notifications">
            <Button size="sm" variant="outline">
              Notification center
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <Label>Template</Label>
              <select
                className="mt-1.5 flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="test-email">Test email</Label>
              <Input
                id="test-email"
                type="email"
                className="mt-1.5"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <Label htmlFor="test-phone">Test phone (10-digit)</Label>
              <Input
                id="test-phone"
                className="mt-1.5"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                maxLength={12}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="min-h-11 flex-1"
                disabled={busy !== null}
                onClick={() => void send("email")}
              >
                {busy === "email" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Send test email
              </Button>
              <Button
                className="min-h-11 flex-1"
                variant="whatsapp"
                disabled={busy !== null}
                onClick={() => void send("whatsapp")}
              >
                {busy === "whatsapp" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
                Send WhatsApp (Meta)
              </Button>
              <Button
                className="min-h-11 flex-1"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void send("sms")}
              >
                {busy === "sms" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
                SMS preview
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <h3 className="font-semibold">Last result</h3>
            {waMessageId && (
              <div>
                <Label>WhatsApp Meta result</Label>
                <Textarea
                  readOnly
                  className="mt-1.5 text-xs"
                  value={waMessageId}
                  rows={2}
                />
              </div>
            )}
            {smsPreview && (
              <div>
                <Label>SMS preview</Label>
                <Textarea readOnly className="mt-1.5" value={smsPreview} rows={3} />
              </div>
            )}
            <div>
              <Label>Raw response</Label>
              <Textarea
                readOnly
                className="mt-1.5 font-mono text-xs"
                rows={10}
                value={
                  lastResult
                    ? JSON.stringify(lastResult, null, 2)
                    : "No send yet"
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Setup (free first)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Email: set <code className="text-xs">GMAIL_USER</code> +{" "}
              <code className="text-xs">GMAIL_APP_PASSWORD</code> (+ optional{" "}
              <code className="text-xs">EMAIL_FROM</code>)
            </li>
            <li>
              WhatsApp: Meta Cloud API — set{" "}
              <code className="text-xs">WHATSAPP_PROVIDER=meta</code>,{" "}
              <code className="text-xs">WHATSAPP_ACCESS_TOKEN</code>,{" "}
              <code className="text-xs">WHATSAPP_PHONE_NUMBER_ID</code>
            </li>
            <li>
              SMS: Mock by default (stored in history). Optional MSG91 later.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
