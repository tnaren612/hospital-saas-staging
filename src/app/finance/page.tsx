import type { Metadata } from "next";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Finance",
  path: "/finance",
  noIndex: true,
});

export default function FinancePortalPage() {
  return <FinanceWorkspace />;
}
