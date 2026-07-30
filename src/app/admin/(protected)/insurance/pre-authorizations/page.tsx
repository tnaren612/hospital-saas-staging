import type { Metadata } from "next";
import { PreAuthorizationManager } from "@/components/admin/hms/insurance/preauth-manager";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Pre-Authorizations",
  path: "/admin/insurance/pre-authorizations",
  noIndex: true,
});

export default function PreAuthPage() {
  return <PreAuthorizationManager />;
}
