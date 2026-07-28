import type { Metadata } from "next";
import { AdminAnalytics } from "@/components/admin/admin-analytics";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Analytics Dashboard",
  path: "/admin/analytics",
  noIndex: true,
});

export default function AdminAnalyticsPage() {
  return <AdminAnalytics />;
}
