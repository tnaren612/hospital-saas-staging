import { NextResponse } from "next/server";
import {
  downloadInvoiceHtml,
  getInvoiceById,
} from "@/lib/payments/payment-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const format = new URL(request.url).searchParams.get("format");

  // Prefer stored PDF when available
  if (format === "pdf") {
    const invoice = await getInvoiceById(params.id);
    if (!invoice) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (invoice.pdf_url) {
      return NextResponse.redirect(invoice.pdf_url, 302);
    }
    // Fallback to printable HTML if PDF not yet generated
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

  const invoice = await getInvoiceById(params.id);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data: invoice });
}
