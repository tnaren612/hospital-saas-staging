import type { Metadata } from "next";
import { DepartmentsManager } from "@/components/admin/hms/departments-manager";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Departments",
  path: "/admin/departments",
  noIndex: true,
});

export default function AdminDepartmentsPage() {
  return <DepartmentsManager />;
}
