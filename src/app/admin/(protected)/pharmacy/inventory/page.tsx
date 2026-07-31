import { PharmacyPageShell } from "@/components/admin/pharmacy/pharmacy-page-shell";
import { InventoryView } from "@/components/admin/pharmacy/inventory-view";

export default function AdminPharmacyInventoryPage() {
  return (
    <PharmacyPageShell>
      <InventoryView />
    </PharmacyPageShell>
  );
}
