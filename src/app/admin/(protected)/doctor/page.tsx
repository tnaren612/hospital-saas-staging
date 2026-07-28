import { redirect } from "next/navigation";

/** Legacy path → /admin/doctors */
export default function AdminDoctorLegacyPage() {
  redirect("/admin/doctors");
}
