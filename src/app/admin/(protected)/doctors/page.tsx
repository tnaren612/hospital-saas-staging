import type { Metadata } from "next";
import { DoctorsManager } from "@/components/admin/hms/doctors-manager";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "Doctor Management",
  path: "/admin/doctors",
  noIndex: true,
});

export default function AdminDoctorsPage() {
  return <DoctorsManager />;
}
