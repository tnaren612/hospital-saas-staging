import { PatientPrescriptions } from "@/components/patient/patient-prescriptions";
import { PatientShell } from "@/components/patient/patient-shell";

export default function PatientPrescriptionsPage() {
  return (
    <PatientShell>
      <PatientPrescriptions />
    </PatientShell>
  );
}
