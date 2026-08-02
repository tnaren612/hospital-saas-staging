import type { Metadata } from "next";
import Link from "next/link";
import { HospitalBillingManager } from "@/components/admin/hms/hospital-billing-manager";
import { Button } from "@/components/ui/button";
import { PortalLogout } from "@/components/auth/portal-logout";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Billing",
  path: "/billing",
  noIndex: true,
});

/** Billing staff portal — hospital bills + link to payments. */
export default function BillingPortalPage() {
  return (
    <div className="container mx-auto max-w-6xl space-y-4 px-4 py-8">
      <PortalLogout />
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/billing">
          <Button size="sm" variant="outline">
            Payments / invoices
          </Button>
        </Link>
        <Link href="/admin/hospital-billing">
          <Button size="sm" variant="outline">
            Full HMS bills
          </Button>
        </Link>
      </div>
      <HospitalBillingManager />
    </div>
  );
}
