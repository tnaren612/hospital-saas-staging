import type { Metadata } from "next";
import { PatientsManager } from "@/components/admin/hms/patients-manager";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Patients",
  path: "/admin/patients",
  noIndex: true,
});

export default function AdminPatientsPage() {
  return <PatientsManager />;
}
