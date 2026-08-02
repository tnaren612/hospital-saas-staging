import { PharmacyPageShell } from "@/components/admin/pharmacy/pharmacy-page-shell";
import { OfflineSyncView } from "@/components/admin/pharmacy/offline-sync-view";

export default function AdminPharmacyOfflineSyncPage() {
  return (
    <PharmacyPageShell>
      <OfflineSyncView />
    </PharmacyPageShell>
  );
}
