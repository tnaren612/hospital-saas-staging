import { PharmacyPageShell } from "@/components/admin/pharmacy/pharmacy-page-shell";
import { LabelPrinter } from "@/components/admin/pharmacy/label-printer";

export default function AdminPharmacyLabelsPage() {
  return (
    <PharmacyPageShell>
      <LabelPrinter />
    </PharmacyPageShell>
  );
}
