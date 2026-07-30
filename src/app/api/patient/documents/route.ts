import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";
import { getPatientDocuments } from "@/lib/patient/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getPatientDocuments();
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Body: { type, title, file_url, file_name, mime_type }
 * File bytes should already be in Storage (patient-files/{userId}/...).
 */
export async function POST(request: Request) {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Document upload requires Supabase patient login" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const type = String(body.type || "other");
    const title = String(body.title || "").trim();
    const file_url = String(body.file_url || "").trim();
    const file_name = String(body.file_name || "");
    const mime_type = String(body.mime_type || "");

    if (!title || !file_url) {
      return NextResponse.json(
        { error: "title and file_url required" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!patient) {
      return NextResponse.json(
        { error: "Patient profile missing. Complete registration." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("patient_documents")
      .insert({
        patient_id: patient.id,
        type,
        title,
        file_url,
        file_name,
        mime_type,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          hint: /schema cache|does not exist/i.test(error.message)
            ? "Run migration 011_patient_portal_phase6.sql"
            : undefined,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
