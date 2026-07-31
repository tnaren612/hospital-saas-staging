"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Download, Eye, FileDown, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ReceiptData } from "@/lib/pharmacy/types";
import {
  RECEIPT_TEMPLATES,
  printEngine,
  type ReceiptTemplate,
} from "@/lib/pharmacy/print-engine";
import { enhanceReceiptWithScannables } from "@/lib/pharmacy/receipt-enhance";

export type ReceiptPreviewProps = {
  data: ReceiptData;
  onClose: () => void;
  /** Called after a successful print action (e.g. to mark printed). */
  onPrinted?: () => void;
};

/**
 * Receipt preview + delivery. Supports 58mm / 80mm / A4 templates, live
 * barcode/QR images injected into the generated HTML, and print / preview /
 * download-HTML / download-PDF channels from the print engine.
 */
export function ReceiptPreview({ data, onClose, onPrinted }: ReceiptPreviewProps) {
  const defaultTemplate =
    data.settings.receipt_paper_size === "A4"
      ? "a4"
      : data.settings.receipt_paper_size === "58mm"
        ? "thermal58"
        : "thermal80";
  const [templateId, setTemplateId] = useState<string>(defaultTemplate);
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const template: ReceiptTemplate =
    RECEIPT_TEMPLATES.find((t) => t.id === templateId) || RECEIPT_TEMPLATES[0];

  const hasScannables = data.settings.show_barcode || data.settings.show_qr_code;

  useEffect(() => {
    let alive = true;
    setHtml("");
    void (async () => {
      const base = printEngine.render(data, template);
      const enhanced = hasScannables
        ? await enhanceReceiptWithScannables(base, data)
        : base;
      if (alive) setHtml(enhanced);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, data]);

  const deliver = async (channelId: string, opts?: { filename?: string }) => {
    setBusy(channelId);
    try {
      const result = await printEngine.deliver(data, html, channelId, opts);
      if (!result.ok || !result.delivered) {
        toast.error(result.message || "Could not deliver receipt.");
        return;
      }
      if (result.message) toast.success(result.message);
      else toast.success("Receipt delivered.");
      onPrinted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Receipt delivery failed.");
    } finally {
      setBusy(null);
    }
  };

  const htmlForPrint = useMemo(() => html, [html]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="my-4 w-full max-w-3xl rounded-2xl bg-background shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Receipt preview</h3>
            <Badge variant="outline">
              {data.sale.sale_number || "—"} · {template.name}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border">
              {RECEIPT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    templateId === t.id
                      ? "bg-primary-600 text-white"
                      : "hover:bg-muted/60"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden /> Close
            </Button>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_180px]">
          <div className="max-h-[70vh] overflow-auto rounded-xl border bg-muted/20 p-3">
            {htmlForPrint ? (
              <iframe
                title="Receipt preview"
                srcDoc={htmlForPrint}
                className="h-[62vh] w-full rounded-lg border bg-white"
              />
            ) : (
              <div className="flex h-[62vh] items-center justify-center text-sm text-muted-foreground">
                Rendering receipt…
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Button className="w-full" disabled={!html || busy !== null} onClick={() => void deliver("print")}>
              <Printer className="h-4 w-4" aria-hidden />
              {busy === "print" ? "Printing…" : "Print"}
            </Button>
            <Button className="w-full" variant="outline" disabled={!html || busy !== null} onClick={() => void deliver("preview")}>
              <Eye className="h-4 w-4" aria-hidden />
              Open preview
            </Button>
            <Button
              className="w-full"
              variant="outline"
              disabled={!html || busy !== null}
              onClick={() =>
                void deliver("download-html", {
                  filename: `${data.sale.sale_number || "receipt"}.html`,
                })
              }
            >
              <Download className="h-4 w-4" aria-hidden />
              Download HTML
            </Button>
            <Button
              className="w-full"
              variant="outline"
              disabled={!html || busy !== null}
              onClick={() =>
                void deliver("download-pdf", {
                  filename: `${data.sale.sale_number || "receipt"}.pdf`,
                })
              }
            >
              <FileDown className="h-4 w-4" aria-hidden />
              PDF (print dialog)
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {hasScannables
                ? "Barcode & QR images are rendered live."
                : "Enable barcode / QR in Pharmacy Settings to add scannables."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
