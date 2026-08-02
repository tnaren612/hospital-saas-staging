import { PharmacyPageShell } from "@/components/admin/pharmacy/pharmacy-page-shell";
import { ImportWizard } from "@/components/admin/pharmacy/import-wizard";

export default function AdminPharmacyImportPage() {
  return (
    <PharmacyPageShell>
      <ImportWizard />
    </PharmacyPageShell>
  );
}
