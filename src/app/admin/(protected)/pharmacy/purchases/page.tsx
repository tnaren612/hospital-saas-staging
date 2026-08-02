import { PharmacyPageShell } from "@/components/admin/pharmacy/pharmacy-page-shell";
import { PurchasesView } from "@/components/admin/pharmacy/purchases-view";

export default function AdminPharmacyPurchasesPage() {
  return (
    <PharmacyPageShell>
      <PurchasesView />
    </PharmacyPageShell>
  );
}
