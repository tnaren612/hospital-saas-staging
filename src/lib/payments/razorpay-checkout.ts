/**
 * Client-only Razorpay Standard Checkout helper.
 * Loads checkout.js and opens the modal. KEY_SECRET is never used here.
 */

export type RazorpayCheckoutInput = {
  key: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  name?: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
};

export type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, handler: (resp: { error?: { description?: string } }) => void) => void;
};

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_URL}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)));
      existing.addEventListener("error", () => resolve(false));
      // Already loaded
      if (window.Razorpay) resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Open Razorpay Standard Checkout. Resolves with payment response or rejects.
 */
export async function openRazorpayCheckout(
  input: RazorpayCheckoutInput
): Promise<RazorpaySuccessResponse> {
  const ok = await loadRazorpayScript();
  if (!ok || !window.Razorpay) {
    throw new Error("Failed to load Razorpay Checkout");
  }

  if (!input.key || !input.orderId) {
    throw new Error("Missing Razorpay key or order_id");
  }

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: input.key,
      amount: input.amountPaise,
      currency: input.currency || "INR",
      name: input.name || "Hospital",
      description: input.description || "Hospital payment",
      order_id: input.orderId,
      prefill: {
        name: input.prefill?.name || "",
        email: input.prefill?.email || "",
        contact: input.prefill?.contact || "",
      },
      notes: input.notes || {},
      theme: { color: "#1a5ff5" },
      handler(response: RazorpaySuccessResponse) {
        resolve({
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss() {
          reject(new Error("Payment cancelled"));
        },
      },
    });

    rzp.on("payment.failed", (resp) => {
      reject(
        new Error(resp?.error?.description || "Razorpay payment failed")
      );
    });

    rzp.open();
  });
}
