/**
 * Invoice PDF upload to Supabase Storage bucket "invoices".
 */

import { createClient as createSupabaseJs } from "@supabase/supabase-js";
import {
  getServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabase/env";
import { paymentLog } from "@/lib/payments/logger";

const BUCKET = "invoices";

function serviceClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  return createSupabaseJs(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function uploadInvoicePdf(input: {
  invoiceId: string;
  invoiceNumber: string;
  pdf: Buffer;
}): Promise<{ ok: boolean; url?: string; path?: string; error?: string }> {
  const sb = serviceClient();
  if (!sb) {
    return { ok: false, error: "Service role required for invoice storage" };
  }

  const safeNumber = String(input.invoiceNumber || input.invoiceId)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  const path = `${input.invoiceId}/${safeNumber}.pdf`;

  const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, input.pdf, {
    cacheControl: "3600",
    upsert: true,
    contentType: "application/pdf",
  });

  if (uploadError) {
    paymentLog.error("invoice.pdf_upload_failed", {
      invoiceId: input.invoiceId,
      error: uploadError.message,
    });
    return { ok: false, error: uploadError.message };
  }

  const {
    data: { publicUrl },
  } = sb.storage.from(BUCKET).getPublicUrl(path);

  return { ok: true, url: publicUrl, path };
}

/**
 * Extract the storage object path from a stored public/signed URL
 * (pure — unit tested). Returns null when the URL is not an object in the
 * invoices bucket (e.g. an external or inline URL).
 */
export function extractInvoicePdfPath(
  publicUrl: string,
  bucket: string = BUCKET
): string | null {
  try {
    const u = new URL(publicUrl);
    const publicMatch = u.pathname.match(/\/object\/public\/([^/]+)\/(.+)$/);
    if (publicMatch && publicMatch[1] === bucket) {
      return decodeURIComponent(publicMatch[2]);
    }
    const signMatch = u.pathname.match(/\/object\/sign\/([^/]+)\/(.+)$/);
    if (signMatch && signMatch[1] === bucket) {
      return decodeURIComponent(signMatch[2]);
    }
  } catch {
    /* not a parseable URL */
  }
  return null;
}

/**
 * Resolve a stored invoice PDF URL to a short-lived signed URL (service role).
 * The invoices bucket is private since migration 046 — public URLs no longer
 * resolve. Returns the original URL when it is not a bucket object, and null
 * when signing fails (caller decides fallback).
 */
export async function resolveInvoicePdfUrl(
  pdfUrl: string,
  ttlSeconds = 3600
): Promise<string | null> {
  const sb = serviceClient();
  if (!sb) return null;
  const path = extractInvoicePdfPath(pdfUrl);
  if (!path) return pdfUrl;
  try {
    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) {
      paymentLog.error("invoice.pdf_sign_failed", {
        path,
        error: error?.message || "no signed url",
      });
      return null;
    }
    return data.signedUrl;
  } catch (error) {
    paymentLog.error("invoice.pdf_sign_failed", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
