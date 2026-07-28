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
