/**
 * Pharmacy Barcode / QR generation (client-only).
 *
 * Barcodes render via jsbarcode → canvas → data URL; QR via qrcode → data URL.
 * Both libraries are lazy-loaded so the server bundle never touches the DOM.
 * Generation functions return null outside a browser (SSR / tests) — callers
 * must degrade gracefully (the receipt printer keeps placeholder blocks).
 */

import type { BarcodeFormat } from "./scan";
import { detectBarcodeFormat } from "./scan";

export type BarcodeImageOpts = {
  format?: BarcodeFormat;
  height?: number;
  width?: number;
  displayValue?: boolean;
  margin?: number;
};

export type QrImageOpts = {
  size?: number;
  margin?: number;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Render a barcode to a PNG data URL. Supported: ean13 / upc / code128 /
 * code39 / qr (via the qrcode lib when format === "qr"). Returns null when a
 * renderer is unavailable.
 */
export async function generateBarcodeDataUrl(
  value: string,
  opts?: BarcodeImageOpts
): Promise<string | null> {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (!isBrowser()) return null;

  const format = opts?.format || detectBarcodeFormat(v);

  if (format === "qr") {
    return generateQrDataUrl(v, { size: opts?.width, margin: opts?.margin });
  }

  type JsBarcodeFn = (
    target: HTMLElement,
    value: string,
    opts?: Record<string, unknown>
  ) => void;
  let JsBarcode: JsBarcodeFn | null = null;
  try {
    const mod = (await import("jsbarcode")) as { default?: unknown };
    const fn = mod.default ?? mod;
    if (typeof fn === "function") JsBarcode = fn as JsBarcodeFn;
  } catch {
    return null;
  }
  if (!JsBarcode) return null;

  const canvas = document.createElement("canvas");
  try {
    JsBarcode(canvas, v, {
      format: mapFormat(format),
      width: 2,
      height: opts?.height || 50,
      margin: opts?.margin ?? 4,
      displayValue: opts?.displayValue ?? true,
      font: "12px monospace",
    });
  } catch {
    return null;
  }
  return canvas.toDataURL("image/png");
}

/** Render a QR code to a PNG data URL (works in browser; null elsewhere). */
export async function generateQrDataUrl(
  text: string,
  opts?: QrImageOpts
): Promise<string | null> {
  if (!text) return null;
  if (!isBrowser()) return null;
  try {
    const mod = await import("qrcode");
    const toDataURL = (mod as { toDataURL?: typeof import("qrcode").toDataURL }).toDataURL;
    if (!toDataURL) return null;
    return await toDataURL(text, {
      width: opts?.size || 160,
      margin: opts?.margin ?? 1,
      errorCorrectionLevel: "M",
    });
  } catch {
    return null;
  }
}

function mapFormat(format: BarcodeFormat): string {
  switch (format) {
    case "ean13":
      return "EAN13";
    case "upc":
      return "UPC";
    case "code39":
      return "CODE39";
    default:
      return "CODE128";
  }
}

/** Human label for a detected format (UI + report). */
export function formatLabel(format: BarcodeFormat): string {
  switch (format) {
    case "ean13":
      return "EAN-13";
    case "upc":
      return "UPC-A";
    case "code128":
      return "Code 128";
    case "code39":
      return "Code 39";
    case "qr":
      return "QR Code";
    default:
      return "Auto";
  }
}

/**
 * Build a printable label sheet (barcode/QR grid) as HTML for window.print().
 * Called client-side only; images are data URLs computed by the caller.
 */
export function labelSheetHtml(opts: {
  title: string;
  labels: Array<{
    code: string;
    caption: string;
    sub?: string;
    imageDataUrl: string;
  }>;
  columns?: number;
  pageSize?: "a4" | "letter";
}): string {
  const columns = opts.columns || 3;
  const cells = opts.labels
    .map(
      (l) => `
      <div class="cell">
        <div class="code">${escapeLabel(l.code)}</div>
        <img src="${l.imageDataUrl}" alt="${escapeLabel(l.code)}" />
        <div class="caption">${escapeLabel(l.caption)}</div>
        ${l.sub ? `<div class="sub">${escapeLabel(l.sub)}</div>` : ""}
      </div>`
    )
    .join("");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeLabel(opts.title)}</title>
<style>
  @page { size: ${opts.pageSize === "letter" ? "letter" : "A4"}; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; }
  h1 { font-size: 14px; text-align: center; margin: 0 0 6mm; }
  .grid { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 4mm; }
  .cell {
    border: 1px solid #999; border-radius: 2mm; padding: 3mm;
    display: flex; flex-direction: column; align-items: center;
    text-align: center; break-inside: avoid;
  }
  .cell img { max-width: 100%; height: 18mm; }
  .code { font-family: 'Courier New', monospace; font-size: 10px; word-break: break-all; }
  .caption { font-size: 10px; font-weight: bold; margin-top: 1mm; }
  .sub { font-size: 9px; color: #555; }
</style>
</head>
<body>
  <h1>${escapeLabel(opts.title)}</h1>
  <div class="grid">${cells}</div>
</body>
</html>`;
}

function escapeLabel(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Print a generated HTML document through a hidden iframe (no popup). */
export function printHtmlViaIframe(html: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    return;
  }
  const cleanup = () => {
    frame.remove();
  };
  win.onafterprint = cleanup;
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  }, 200);
}
