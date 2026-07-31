/**
 * Pharmacy Print Engine — extensible receipt rendering + delivery
 *
 * Design goal: future-proof. Every future feature (jsPDF/pdf-lib, QR code,
 * barcode, WhatsApp/Email receipt, watermark, digital signature, multiple
 * templates, multi-language) is expressed as a stable interface + registry slot.
 * Implementations that are not yet built exist as explicit PLACEHOLDERS with
 * `available: false` so callers can feature-detect instead of throwing.
 *
 * Current shipping implementation: HTML renderer + browser print / print-preview
 * / download-HTML / download-PDF(via browser print dialog).
 */

import type { ReceiptData } from "./types";
import {
  generateThermalReceipt,
  generateA4Receipt,
} from "./receipt";

/** Physical output formats supported by the engine. */
export type ReceiptFormat = "thermal58" | "thermal80" | "a4";

/** A named, configurable receipt template. Extend via the registry, not forks. */
export type ReceiptTemplate = {
  id: string;
  name: string;
  description?: string;
  format: ReceiptFormat;
  default?: boolean;
};

/** Built-in templates. Administrators may choose one; more can be registered. */
export const RECEIPT_TEMPLATES: ReceiptTemplate[] = [
  { id: "thermal58", name: "Thermal 58mm", format: "thermal58", default: true },
  { id: "thermal80", name: "Thermal 80mm", format: "thermal80", default: true },
  { id: "a4", name: "A4 Invoice", format: "a4", default: true },
];

/** Feature-detect a template by id, falling back to a default by format. */
export function resolveTemplate(
  templateId?: string | null,
  format?: ReceiptFormat
): ReceiptTemplate {
  const byId = RECEIPT_TEMPLATES.find((t) => t.id === templateId);
  if (byId) return byId;
  const fallback =
    RECEIPT_TEMPLATES.find((t) => t.format === format) ||
    RECEIPT_TEMPLATES[0];
  return fallback;
}

/**
 * A renderer turns ReceiptData + a template into a renderable document (HTML).
 * Future renderers (PDF via jsPDF/pdf-lib, image) implement the same contract.
 */
export interface ReceiptRenderer {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
  render(data: ReceiptData, template: ReceiptTemplate): string;
}

/** HTML renderer — delegates to the existing receipt generators. */
export const htmlReceiptRenderer: ReceiptRenderer = {
  id: "html",
  name: "HTML",
  available: true,
  render(data: ReceiptData, template: ReceiptTemplate) {
    if (template.format === "a4") return generateA4Receipt(data);
    const paper = template.format === "thermal58" ? "58mm" : "80mm";
    return generateThermalReceipt(data, paper);
  },
};

/** Placeholder for a native PDF renderer (jsPDF / pdf-lib). Not yet built. */
export const pdfReceiptRenderer: ReceiptRenderer = {
  id: "pdf",
  name: "PDF",
  available: false,
  render() {
    throw new Error(
      "pdfReceiptRenderer is a placeholder. Integrate jsPDF/pdf-lib in a future increment."
    );
  },
};

/** Placeholder for a QR-code overlay renderer. Not yet built. */
export const qrOverlayRenderer: ReceiptRenderer = {
  id: "qr-overlay",
  name: "QR Code",
  available: false,
  render() {
    throw new Error("qrOverlayRenderer is a placeholder. Integrate a QR lib later.");
  },
};

/** Placeholder for a barcode overlay renderer. Not yet built. */
export const barcodeOverlayRenderer: ReceiptRenderer = {
  id: "barcode-overlay",
  name: "Barcode",
  available: false,
  render() {
    throw new Error(
      "barcodeOverlayRenderer is a placeholder. Integrate a barcode lib later."
    );
  },
};

/** Result of a delivery attempt. `delivered` is false for placeholders. */
export type DeliveryResult = {
  ok: boolean;
  channel: string;
  delivered: boolean;
  message?: string;
};

/**
 * A delivery channel pushes a rendered receipt to an output: printer, screen,
 * file, email, WhatsApp. New channels (email, WhatsApp) implement this contract.
 */
export interface ReceiptDeliveryChannel {
  readonly id: string;
  readonly name: string;
  /** False for channels not yet configured/built. */
  readonly available: boolean;
  deliver(data: ReceiptData, html: string, opts?: DeliveryOptions): DeliveryResult | Promise<DeliveryResult>;
}

export type DeliveryOptions = {
  template?: ReceiptTemplate;
  recipient?: string;
  filename?: string;
};

/** Push to a physical/browser printer via the native print dialog. */
export const printChannel: ReceiptDeliveryChannel = {
  id: "print",
  name: "Print",
  available: true,
  deliver(_data, html) {
    void _data;
    if (typeof window === "undefined") {
      return { ok: false, channel: "print", delivered: false, message: "No window" };
    }
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) {
      return { ok: false, channel: "print", delivered: false, message: "Popup blocked" };
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
    return { ok: true, channel: "print", delivered: true };
  },
};

/** Open a print-preview window (no automatic print). */
export const previewChannel: ReceiptDeliveryChannel = {
  id: "preview",
  name: "Preview",
  available: true,
  deliver(_data, html) {
    void _data;
    if (typeof window === "undefined") {
      return { ok: false, channel: "preview", delivered: false, message: "No window" };
    }
    const w = window.open("", "_blank", "width=480,height=720");
    if (!w) {
      return { ok: false, channel: "preview", delivered: false, message: "Popup blocked" };
    }
    w.document.write(html);
    w.document.close();
    return { ok: true, channel: "preview", delivered: true };
  },
};

/** Download the receipt as an HTML file. */
export const downloadHtmlChannel: ReceiptDeliveryChannel = {
  id: "download-html",
  name: "Download HTML",
  available: true,
  deliver(_data, html, opts) {
    void _data;
    if (typeof window === "undefined") {
      return { ok: false, channel: "download-html", delivered: false };
    }
    const filename = opts?.filename || "receipt.html";
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { ok: true, channel: "download-html", delivered: true };
  },
};

/**
 * Download as PDF. This pass routes through the browser print dialog where the
 * user selects "Save as PDF". Swap this implementation for a native pdf-lib
 * renderer (pdfReceiptRenderer) without changing call sites.
 */
export const downloadPdfChannel: ReceiptDeliveryChannel = {
  id: "download-pdf",
  name: "Download PDF",
  available: true,
  deliver(_data, html, opts) {
    void _data;
    if (typeof window === "undefined") {
      return { ok: false, channel: "download-pdf", delivered: false };
    }
    const w = window.open("", "_blank", "width=480,height=720");
    if (!w) {
      return { ok: false, channel: "download-pdf", delivered: false, message: "Popup blocked" };
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
    return {
      ok: true,
      channel: "download-pdf",
      delivered: true,
      message: opts?.filename
        ? `Choose "Save as PDF" with filename ${opts.filename}`
        : undefined,
    };
  },
};

/** Placeholder — email receipt delivery. Requires SMTP/notification wiring. */
export const emailChannel: ReceiptDeliveryChannel = {
  id: "email",
  name: "Email Receipt",
  available: false,
  deliver(_data, _html, _opts) {
    void _data;
    void _html;
    void _opts;
    return {
      ok: false,
      channel: "email",
      delivered: false,
      message: "Email receipt is a placeholder — wire into the notification service later.",
    };
  },
};

/** Placeholder — WhatsApp receipt delivery. Requires a WhatsApp provider. */
export const whatsappChannel: ReceiptDeliveryChannel = {
  id: "whatsapp",
  name: "WhatsApp Receipt",
  available: false,
  deliver(_data, _html, _opts) {
    void _data;
    void _html;
    void _opts;
    return {
      ok: false,
      channel: "whatsapp",
      delivered: false,
      message: "WhatsApp receipt is a placeholder — wire into a WhatsApp provider later.",
    };
  },
};

/** Registry of all delivery channels. Feature-detect via `available`. */
export const deliveryChannels: ReceiptDeliveryChannel[] = [
  printChannel,
  previewChannel,
  downloadHtmlChannel,
  downloadPdfChannel,
  emailChannel,
  whatsappChannel,
];

export function getDeliveryChannel(id: string): ReceiptDeliveryChannel | undefined {
  return deliveryChannels.find((c) => c.id === id);
}

// ----------------------------------------------------------------------------
// Composability stubs (future features) — interface-only, available:false.
// ----------------------------------------------------------------------------

/** Watermark overlay service. Provide an implementation to enable watermarks. */
export interface WatermarkService {
  readonly id: string;
  readonly available: boolean;
  apply(html: string, text?: string): string;
}

export const watermarkService: WatermarkService = {
  id: "watermark",
  available: false,
  apply(html: string) {
    // Placeholder — a future increment overlays a diagonal watermark.
    return html;
  },
};

/** Digital signature embed service (static signature image or PKI). */
export interface DigitalSignatureService {
  readonly id: string;
  readonly available: boolean;
  embed(html: string, signatureUrl?: string): string;
}

export const digitalSignatureService: DigitalSignatureService = {
  id: "digital-signature",
  available: false,
  embed(html: string) {
    // Placeholder — a future increment embeds a signature block.
    return html;
  },
};

/**
 * High-level engine facade used by the UI.
 * render() → delivery(). Keeps call sites decoupled from renderer/channel internals.
 */
export const printEngine = {
  render(data: ReceiptData, template?: ReceiptTemplate | null): string {
    const resolved = template || resolveTemplate(undefined, mapFormat(data.settings.receipt_paper_size));
    return htmlReceiptRenderer.render(data, resolved);
  },

  async deliver(
    data: ReceiptData,
    html: string,
    channelId: string,
    opts?: DeliveryOptions
  ): Promise<DeliveryResult> {
    const channel = getDeliveryChannel(channelId);
    if (!channel) {
      return { ok: false, channel: channelId, delivered: false, message: "Unknown channel" };
    }
    return channel.deliver(data, html, opts);
  },
};

function mapFormat(paper?: string): ReceiptFormat | undefined {
  if (paper === "58mm") return "thermal58";
  if (paper === "A4") return "a4";
  return "thermal80";
}
