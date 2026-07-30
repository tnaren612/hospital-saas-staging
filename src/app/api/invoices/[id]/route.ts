/**
 * C-03: Invoice fetch requires staff auth OR owning patient session.
 * No public PHI dump by UUID alone.
 */

import { NextResponse } from "next/server";
import {
  downloadInvoiceHtml,
  getInvoiceById,
} from "@/lib/payments/payment-service";
import { requireHmsAdmin } from "@/lib/hms/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";
import type { InvoiceRecord } from "@/lib/payments/types";

export const dynamic = "force-dynamic";

async function authorizeInvoiceAccess(
  invoice: InvoiceRecord
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const gate = await requireHmsAdmin();
  if (!gate.error && gate.supabase) {
    return { ok: true };
  }

  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }

    const { data: patient } = await supabase
      .from("patients")
      .select("id, phone, email")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!patient) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }

    const phoneMatch =
      patient.phone &&
      invoice.patient_phone &&
      String(patient.phone).replace(/\D/g, "").slice(-10) ===
        String(invoice.patient_phone).replace(/\D/g, "").slice(-10);
    const emailMatch =
      patient.email &&
      invoice.patient_email &&
      String(patient.email).toLowerCase() ===
        String(invoice.patient_email).toLowerCase();
    const idMatch =
      invoice.patient_id && String(invoice.patient_id) === String(patient.id);

    if (idMatch || phoneMatch || emailMatch) {
      return { ok: true };
    }

    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const format = new URL(request.url).searchParams.get("format");
  const invoice = await getInvoiceById(params.id);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await authorizeInvoiceAccess(invoice);
  if (!auth.ok) return auth.response;

  // Prefer stored PDF when available
  if (format === "pdf") {
    if (invoice.pdf_url) {
      return NextResponse.redirect(invoice.pdf_url, 302);
    }
    const result = await downloadInvoiceHtml(params.id);
    if (!result.ok || !result.html) {
      return NextResponse.json(
        { error: result.error || "Not found" },
        { status: 404 }
      );
    }
    return new NextResponse(result.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="invoice-${result.invoice?.invoice_number || params.id}.html"`,
      },
    });
  }

  if (format === "html") {
    const result = await downloadInvoiceHtml(params.id);
    if (!result.ok || !result.html) {
      return NextResponse.json(
        { error: result.error || "Not found" },
        { status: 404 }
      );
    }
    return new NextResponse(result.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="invoice-${result.invoice?.invoice_number || params.id}.html"`,
      },
    });
  }

  return NextResponse.json({ data: invoice });
}
