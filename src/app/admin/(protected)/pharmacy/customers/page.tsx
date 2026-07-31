import { PharmacyPageShell } from "@/components/admin/pharmacy/pharmacy-page-shell";
import { PartyView } from "@/components/admin/pharmacy/party-view";

export default function AdminPharmacyCustomersPage() {
  return (
    <PharmacyPageShell>
      <PartyView
        entity="customer"
        title="Customers"
        description="Registered pharmacy customers — phone, email and city"
        emptyHint="Add your first customer or import them from a spreadsheet."
      />
    </PharmacyPageShell>
  );
}
