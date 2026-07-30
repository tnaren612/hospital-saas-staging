"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { IndianRupee, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { openRazorpayCheckout } from "@/lib/payments/razorpay-checkout";
import { WhatsAppSendButton } from "@/components/notifications/whatsapp-send-button";
import { useHospitalConfig } from "@/components/hospital/hospital-config-provider";

type PublicSettings = {
  online_payment_enabled: boolean;
  cash_enabled: boolean;
  razorpay_enabled?: boolean;
  currency: string;
  tax_percentage: number;
  /** Public KEY_ID only — never KEY_SECRET */
  razorpay_key_id?: string;
};

type GatewayPayload = {
  provider: string;
  orderId: string;
  amount: number;
  amountPaise?: number;
  currency: string;
  publicKey?: string;
  name?: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  checkoutHint?: string;
};

type Props = {
  amount: number;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  appointmentId?: string;
  doctorName?: string;
  departmentName?: string;
  packageName?: string;
  packageId?: string;
};

/**
 * Optional post-booking payment panel.
 * Online path: createPayment → Razorpay Standard Checkout → verifyPayment (HMAC).
 */
export function PaymentOptions(props: Props) {
  const { config } = useHospitalConfig();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [busy, setBusy] = useState<"cash" | "online" | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/payments/settings", { cache: "no-store" });
        const json = await res.json();
        if (res.ok) setSettings(json.data);
      } catch {
        setSettings(null);
      }
    })();
  }, []);

  if (!settings) return null;
  if (!settings.cash_enabled && !settings.online_payment_enabled) return null;
  if (done) {
    return (
      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
        {done}
      </div>
    );
  }

  const verifyServer = async (body: Record<string, unknown>) => {
    const vRes = await fetch("/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const vJson = await vRes.json();
    if (!vRes.ok) throw new Error(vJson.error || "Verification failed");
    return vJson.data;
  };

  const pay = async (method: "cash" | "online") => {
    setBusy(method);
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: props.appointmentId,
          package_id: props.packageId,
          package_name: props.packageName,
          patient_name: props.patientName,
          patient_phone: props.patientPhone,
          patient_email: props.patientEmail || "",
          doctor_name: props.doctorName,
          department_name: props.departmentName,
          amount: props.amount,
          payment_method: method,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Payment failed");

      if (method === "cash") {
        setDone(
          `Cash payment recorded. Invoice ${json.data?.invoice?.invoice_number || ""} — pay at hospital reception.`
        );
        toast.success("Cash payment option confirmed");
        return;
      }

      const gateway = json.data?.gateway as GatewayPayload | undefined;
      const payment = json.data?.payment as
        | { id: string; payment_reference: string; payment_provider: string }
        | undefined;

      if (!payment?.id || !gateway?.orderId) {
        throw new Error("Invalid payment response");
      }

      // --- Razorpay Standard Checkout ---
      if (gateway.provider === "razorpay") {
        const key =
          gateway.publicKey ||
          settings.razorpay_key_id ||
          "";
        if (!key) {
          throw new Error(
            "Razorpay KEY_ID missing. Set RAZORPAY_KEY_ID on the server."
          );
        }

        const amountPaise =
          gateway.amountPaise ||
          Math.round(Number(gateway.amount || props.amount) * 100);

        const rzpResponse = await openRazorpayCheckout({
          key,
          orderId: gateway.orderId,
          amountPaise,
          currency: gateway.currency || settings.currency || "INR",
          name: gateway.name || config.branding.name,
          description: gateway.description || props.packageName || "Hospital payment",
          prefill: gateway.prefill || {
            name: props.patientName,
            email: props.patientEmail,
            contact: props.patientPhone,
          },
          notes: {
            payment_id: payment.id,
            reference: payment.payment_reference,
          },
        });

        // Server HMAC verify — marks payment + invoice paid only if signature valid
        await verifyServer({
          payment_id: payment.id,
          appointment_id: props.appointmentId || undefined,
          provider: "razorpay",
          razorpay_order_id: rzpResponse.razorpay_order_id,
          razorpay_payment_id: rzpResponse.razorpay_payment_id,
          razorpay_signature: rzpResponse.razorpay_signature,
          transaction_id: rzpResponse.razorpay_payment_id,
        });

        setDone(
          `Payment successful. Ref ${payment.payment_reference}. Invoice is available under Patient → Payments.`
        );
        toast.success("Payment verified");
        return;
      }

      // Stripe redirect (if returned)
      if (gateway.provider === "stripe" && gateway.checkoutHint) {
        const checkoutUrl = new URL(gateway.checkoutHint);
        const trustedStripeHost =
          checkoutUrl.protocol === "https:" &&
          (checkoutUrl.hostname === "checkout.stripe.com" ||
            checkoutUrl.hostname.endsWith(".stripe.com"));
        if (!trustedStripeHost) {
          throw new Error("Payment provider returned an invalid checkout URL");
        }
        window.location.assign(checkoutUrl.toString());
        return;
      }

      // Mock fallback (keys not configured)
      if (gateway.provider === "mock") {
        await verifyServer({
          payment_id: payment.id,
          appointment_id: props.appointmentId || undefined,
          provider: "mock",
          transaction_id: `pay_mock_${Date.now()}`,
          razorpay_order_id: gateway.orderId,
          razorpay_payment_id: `pay_mock_${Date.now()}`,
          razorpay_signature: "mock_signature",
        });
        setDone(
          `Online payment completed (mock — set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET for live checkout). Ref ${payment.payment_reference}.`
        );
        toast.success("Mock payment completed");
        return;
      }

      throw new Error(`Unsupported provider: ${gateway.provider}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Payment failed";
      if (message === "Payment cancelled") {
        toast.error("Payment window closed");
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(null);
    }
  };

  if (done) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          {done}
        </p>
        {props.patientPhone && (
          <div className="mt-3">
            <WhatsAppSendButton
              phone={props.patientPhone}
              templateId="payment_success"
              vars={{
                patientName: props.patientName,
                amount: props.amount,
                amountLabel: formatCurrency(props.amount),
                invoiceNumber: "see portal",
                hospitalName: config.branding.name,
              }}
              label="Send via WhatsApp"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border bg-card p-4 text-left">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <IndianRupee className="h-4 w-4 text-primary-600" />
        Payment options
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Amount: {formatCurrency(props.amount)}
        {settings.tax_percentage
          ? ` + ${settings.tax_percentage}% tax (applied at checkout)`
          : ""}
        . Online payment is optional — your appointment is already saved.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {settings.cash_enabled && (
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => void pay("cash")}
          >
            {busy === "cash" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Cash at hospital
          </Button>
        )}
        {settings.online_payment_enabled && (
          <Button size="sm" disabled={!!busy} onClick={() => void pay("online")}>
            {busy === "online" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Pay online
            {settings.razorpay_enabled || settings.razorpay_key_id
              ? " (Razorpay)"
              : ""}
          </Button>
        )}
      </div>
    </div>
  );
}
