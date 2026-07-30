import type { Metadata } from "next";
import { ReceptionWorkspace } from "@/components/reception/reception-workspace";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Reception",
  path: "/reception",
  noIndex: true,
});

export default function ReceptionPortalPage() {
  return <ReceptionWorkspace />;
}
