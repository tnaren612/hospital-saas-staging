import { PharmacyPageShell } from "@/components/admin/pharmacy/pharmacy-page-shell";
import { PartyView } from "@/components/admin/pharmacy/party-view";

export default function AdminPharmacySuppliersPage() {
  return (
    <PharmacyPageShell>
      <PartyView
        entity="supplier"
        title="Suppliers"
        description="Medicine suppliers and distributors"
        emptyHint="Add your first supplier or import them from a spreadsheet."
      />
    </PharmacyPageShell>
  );
}
