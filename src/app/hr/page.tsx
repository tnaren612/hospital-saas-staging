import type { Metadata } from "next";
import { HrWorkspace } from "@/components/hr/hr-workspace";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "HR",
  path: "/hr",
  noIndex: true,
});

export default function HrPortalPage() {
  return <HrWorkspace />;
}
