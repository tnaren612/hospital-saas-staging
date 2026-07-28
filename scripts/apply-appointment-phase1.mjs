/**
 * Apply Phase 1 appointment seed (departments + primary doctor) when tables exist.
 * DDL (partial unique index) must still be run in Supabase SQL Editor: 007_appointment_phase1.sql
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 1) continue;
  let k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  )
    v = v.slice(1, -1);
  process.env[k] = v;
}

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const depts = [
  ["Pulmonology", "pulmonology", "Lung and respiratory care"],
  ["Critical Care", "critical-care", "ICU and critical care services"],
  ["General Medicine", "general-medicine", "General medical consultation"],
  ["Emergency", "emergency", "24×7 emergency care"],
  ["Diagnostics", "diagnostics", "Lab and diagnostic services"],
  ["Pharmacy", "pharmacy", "In-house pharmacy"],
];

for (const [name, slug, description] of depts) {
  const { error } = await s.from("departments").upsert(
    { name, slug, description, status: "active" },
    { onConflict: "slug" }
  );
  console.log("dept", slug, error ? error.message : "ok");
}

const { data: pulmo } = await s
  .from("departments")
  .select("id")
  .eq("slug", "pulmonology")
  .maybeSingle();

const { data: existing } = await s
  .from("hospital_doctors")
  .select("id, name")
  .ilike("name", "%varaprasad%")
  .limit(1);

if (existing?.length) {
  console.log("doctor exists", existing[0].id);
} else if (pulmo?.id) {
  const { data, error } = await s
    .from("hospital_doctors")
    .insert({
      department_id: pulmo.id,
      name: "Dr. Varaprasad Venkata Sumanth",
      title: "Consultant Pulmonologist & Critical Care",
      qualifications: ["MBBS", "MD (Pulmonary Medicine)"],
      specializations: ["Pulmonology", "Critical Care", "Sleep Medicine"],
      experience_years: 15,
      experience_notes:
        "Specialist in asthma, COPD, ICU and respiratory emergencies.",
      consultation_fee: 500,
      available_days: ["mon", "tue", "wed", "thu", "fri", "sat"],
      time_slots: [
        "09:00 AM",
        "09:30 AM",
        "10:00 AM",
        "10:30 AM",
        "11:00 AM",
        "11:30 AM",
        "12:00 PM",
        "12:30 PM",
        "02:00 PM",
        "02:30 PM",
        "03:00 PM",
        "03:30 PM",
        "04:00 PM",
        "04:30 PM",
        "05:00 PM",
        "05:30 PM",
        "06:00 PM",
        "06:30 PM",
      ],
      biography:
        "Senior consultant providing comprehensive respiratory care at Sri Srinivasa Hospital, Badvel.",
      status: "active",
      sort_order: 0,
    })
    .select("id")
    .single();
  console.log("doctor seed", error ? error.message : data?.id);
} else {
  console.log("skip doctor seed — no pulmonology dept");
}

// Probe optional columns
const probe = await s
  .from("appointments")
  .select("id, department_id, booking_ref")
  .limit(1);
console.log(
  "appointments optional cols:",
  probe.error ? probe.error.message : "ok (migration 007 applied or ignored)"
);

const { data: docs } = await s
  .from("hospital_doctors")
  .select("id, name, department_id, status")
  .eq("status", "active");
console.log("active doctors", docs?.length || 0, docs);
