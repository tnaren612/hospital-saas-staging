import { PharmacyPageShell } from "@/components/admin/pharmacy/pharmacy-page-shell";
import { PaymentsView } from "@/components/admin/pharmacy/payments-view";

export default function AdminPharmacyPaymentsPage() {
  return (
    <PharmacyPageShell>
      <PaymentsView />
    </PharmacyPageShell>
  );
}
