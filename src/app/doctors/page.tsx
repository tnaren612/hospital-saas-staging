import type { Metadata } from "next";
import { DoctorsListingContent } from "@/components/pages/doctors-listing-content";
import {
  listPublicDepartments,
  listPublicDoctors,
} from "@/lib/doctors/service";
import { createMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createMetadata({
  title: "Our Doctors",
  description:
    "Meet the medical specialists at Sri Srinivasa Hospital, Badvel — pulmonology, critical care, and more. Book appointments online.",
  path: "/doctors",
});

export default async function DoctorsPage() {
  const [doctors, departments] = await Promise.all([
    listPublicDoctors(),
    listPublicDepartments(),
  ]);

  return (
    <DoctorsListingContent
      doctors={doctors}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
