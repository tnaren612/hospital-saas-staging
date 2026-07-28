import type { Metadata } from "next";
import { AdminDashboardHome } from "@/components/admin/admin-dashboard-home";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Admin Dashboard",
  path: "/admin/dashboard",
  noIndex: true,
});

export default function AdminDashboardPage() {
  return <AdminDashboardHome />;
}
