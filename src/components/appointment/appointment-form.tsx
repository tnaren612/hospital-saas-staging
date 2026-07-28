"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { format, addDays } from "date-fns";
import toast from "react-hot-toast";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Stethoscope,
  Building2,
  Package,
} from "lucide-react";
import {
  appointmentSchema,
  type AppointmentFormValues,
} from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/hooks/use-locale";
import {
  checkSlotBooked,
  createAppointment,
  getBookedSlotKeysForDate,
  isUsingSupabase,
} from "@/lib/appointments/service";
import {
  doctorWorksOnDate,
  getBookingDepartments,
  getBookingDoctors,
  getDayAvailability,
  groupSlotsByPeriod,
  type BookingDepartment,
  type BookingDoctor,
} from "@/lib/appointments/catalog";
import type { TimePeriod } from "@/types";
import { cn } from "@/lib/utils";
import { PaymentOptions } from "@/components/payments/payment-options";

interface AppointmentFormProps {
  defaultType?: "in-person" | "video";
}

type PaymentContext = {
  appointmentId?: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  doctorName: string;
  departmentName?: string;
  packageName?: string;
  amount: number;
};

export function AppointmentForm({
  defaultType = "in-person",
}: AppointmentFormProps) {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const packageSlug = searchParams.get("package") || "";
  const packageName =
    searchParams.get("packageName") ||
    (packageSlug ? packageSlug.replace(/-/g, " ") : "");
  const prefDepartment = searchParams.get("department") || "";
  const prefDoctor = searchParams.get("doctor") || "";

  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("morning");
  const [bookedKeys, setBookedKeys] = useState<string[]>([]);
  const [backendLabel, setBackendLabel] = useState<"supabase" | "local">(
    "local"
  );
  const [departments, setDepartments] = useState<BookingDepartment[]>([]);
  const [doctors, setDoctors] = useState<BookingDoctor[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [dayBlocked, setDayBlocked] = useState(false);
  const [dayBlockReason, setDayBlockReason] = useState("");
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [lastBookingRef, setLastBookingRef] = useState<string | null>(null);
  const [paymentCtx, setPaymentCtx] = useState<PaymentContext | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      doctorId: "",
      departmentId: "",
      type: defaultType,
      gender: undefined,
      date: "",
      timeSlot: "",
    },
  });

  const selectedDate = watch("date");
  const selectedSlot = watch("timeSlot");
  const selectedDepartmentId = watch("departmentId");
  const selectedDoctorId = watch("doctorId");

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedDoctorId) || null,
    [doctors, selectedDoctorId]
  );

  const slotGroups = useMemo(() => {
    if (selectedDoctor?.time_slots?.length) {
      return groupSlotsByPeriod(selectedDoctor.time_slots);
    }
    return { morning: [], afternoon: [], evening: [] } as Record<
      TimePeriod,
      string[]
    >;
  }, [selectedDoctor]);

  useEffect(() => {
    setBackendLabel(isUsingSupabase() ? "supabase" : "local");
  }, []);

  // Load departments once (+ package / deep-link prefs)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setCatalogLoading(true);
      try {
        const deps = await getBookingDepartments();
        if (cancelled) return;
        setDepartments(deps);
        const preferred =
          (prefDepartment &&
            deps.find((d) => d.id === prefDepartment)?.id) ||
          deps[0]?.id ||
          "";
        if (preferred) setValue("departmentId", preferred);
        if (packageName) {
          setValue(
            "problem",
            `Booking health package: ${packageName}${
              packageSlug ? ` (${packageSlug})` : ""
            }`
          );
        }
      } catch (e) {
        console.warn(e);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefDepartment, packageName, packageSlug]);

  // Load doctors when department changes
  useEffect(() => {
    if (!selectedDepartmentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await getBookingDoctors(selectedDepartmentId);
        if (cancelled) return;
        setDoctors(list);
        const preferredDoctor =
          (prefDoctor && list.find((d) => d.id === prefDoctor)?.id) ||
          (list.some((d) => d.id === selectedDoctorId)
            ? selectedDoctorId
            : list[0]?.id) ||
          "";
        if (preferredDoctor !== selectedDoctorId) {
          setValue("doctorId", preferredDoctor);
          setValue("timeSlot", "");
        }
      } catch (e) {
        console.warn(e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDepartmentId]);

  // Booked slots + leave when date/doctor change
  const refreshSlots = useCallback(async () => {
    if (!selectedDate || !selectedDoctorId) {
      setBookedKeys([]);
      setDayBlocked(false);
      setDayBlockReason("");
      return;
    }

    if (selectedDoctor && !doctorWorksOnDate(selectedDoctor, selectedDate)) {
      setDayBlocked(true);
      setDayBlockReason("Doctor is not available on this weekday.");
      setBookedKeys([]);
      return;
    }

    const day = await getDayAvailability(selectedDoctorId, selectedDate);
    if (!day.available) {
      setDayBlocked(true);
      setDayBlockReason(
        day.note || `Doctor is marked as ${day.status.replace("_", " ")}.`
      );
      setBookedKeys([]);
      return;
    }

    setDayBlocked(false);
    setDayBlockReason("");
    const keys = await getBookedSlotKeysForDate(
      selectedDate,
      selectedDoctorId
    );
    setBookedKeys(keys);
  }, [selectedDate, selectedDoctorId, selectedDoctor]);

  useEffect(() => {
    void refreshSlots();
  }, [refreshSlots, selectedPeriod, success]);

  const minDate = format(new Date(), "yyyy-MM-dd");
  const maxDate = format(addDays(new Date(), 60), "yyyy-MM-dd");

  const periods: { key: TimePeriod; label: string }[] = [
    { key: "morning", label: t.appointment.morning },
    { key: "afternoon", label: t.appointment.afternoon },
    { key: "evening", label: t.appointment.evening },
  ];

  const availableSlots = useMemo(() => {
    const times = slotGroups[selectedPeriod] || [];
    return times.map((time) => ({
      time,
      booked: selectedDate
        ? bookedKeys.includes(`${selectedDate}|${time}`)
        : false,
    }));
  }, [slotGroups, selectedPeriod, selectedDate, bookedKeys]);

  const onSubmit = async (data: AppointmentFormValues) => {
    // Double-click / double-submit guard
    if (submitting) return;
    if (!selectedDoctor) {
      toast.error("Please select a doctor");
      return;
    }
    if (dayBlocked) {
      toast.error(dayBlockReason || "Doctor not available on this date");
      return;
    }

    setSubmitting(true);
    try {
      const alreadyBooked = await checkSlotBooked(
        data.date,
        data.timeSlot,
        data.doctorId
      );
      if (alreadyBooked) {
        toast.error("This slot was just booked. Please choose another.");
        setSubmitting(false);
        return;
      }

      const period: TimePeriod =
        slotGroups.morning.includes(data.timeSlot)
          ? "morning"
          : slotGroups.afternoon.includes(data.timeSlot)
            ? "afternoon"
            : "evening";

      const dept = departments.find((d) => d.id === data.departmentId);

      // Prefer server API (saves + automatic email + Meta WhatsApp)
      let appointmentRef: string | undefined;
      let appointmentId: string | undefined;
      let emailOk = false;
      let waOk = false;
      let waError: string | undefined;
      let source: "supabase" | "local" = "local";

      if (isUsingSupabase()) {
        const res = await fetch("/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            type: data.type || defaultType,
            doctorName: selectedDoctor.name,
            departmentName: dept?.name,
            period,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 409 || json.code === "SLOT_TAKEN") {
          throw new Error("SLOT_TAKEN");
        }
        if (res.status === 409 || json.code === "DOCTOR_UNAVAILABLE") {
          throw new Error(json.error || "Doctor unavailable");
        }
        if (!res.ok) {
          // Fall back to client service, then notify via API
          const { appointment, source: src } = await createAppointment({
            ...data,
            type: data.type || defaultType,
            doctorName: selectedDoctor.name,
            departmentName: dept?.name,
            period,
            status: "confirmed",
          });
          source = src;
          appointmentRef = appointment.bookingRef;
          appointmentId = appointment.id;
        } else {
          source = "supabase";
          appointmentRef = json.data?.booking_ref;
          appointmentId = json.data?.id;
          emailOk = Boolean(json.notifications?.email);
          const wa = json.notifications?.whatsapp;
          if (wa && typeof wa === "object") {
            waOk = Boolean(
              (wa as { ok?: boolean }).ok ||
                (wa as { status?: string }).status === "sent"
            );
            waError = (wa as { error?: string }).error;
          }
        }
      } else {
        const { appointment, source: src } = await createAppointment({
          ...data,
          type: data.type || defaultType,
          doctorName: selectedDoctor.name,
          departmentName: dept?.name,
          period,
          status: "confirmed",
        });
        source = src;
        appointmentRef = appointment.bookingRef;
        appointmentId = appointment.id;
      }

      // Auto-send Meta WhatsApp (+ email) when booking API did not already do it
      // (local save, fallback path, or partial API failure)
      if (!waOk) {
        try {
          const notifyRes = await fetch("/api/appointments/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patientName: data.patientName,
              phone: data.phone,
              email: data.email,
              doctorName: selectedDoctor.name,
              departmentName: dept?.name || "Pulmonology",
              date: data.date,
              timeSlot: data.timeSlot,
              type: data.type || defaultType,
              bookingRef: appointmentRef,
              appointmentId,
            }),
          });
          const notifyJson = await notifyRes.json().catch(() => ({}));
          if (notifyJson?.notifications?.email) emailOk = true;
          const wa = notifyJson?.notifications?.whatsapp;
          if (wa && typeof wa === "object") {
            if (wa.ok || wa.status === "sent") waOk = true;
            if (wa.error) waError = String(wa.error);
          }
        } catch {
          /* non-blocking — booking already saved */
        }
      }

      setBackendLabel(source);
      setEmailSent(emailOk);
      setWhatsappSent(waOk);
      setLastBookingRef(appointmentRef || null);
      setPaymentCtx({
        appointmentId,
        patientName: data.patientName,
        patientPhone: data.phone,
        patientEmail: data.email,
        doctorName: selectedDoctor.name,
        departmentName: dept?.name,
        packageName: packageName || undefined,
        amount:
          selectedDoctor.consultation_fee > 0
            ? selectedDoctor.consultation_fee
            : data.type === "video"
              ? 400
              : 500,
      });
      toast.success(t.appointment.successTitle);
      if (source === "supabase") {
        toast.success("Saved to hospital database", { icon: "☁️" });
      } else {
        toast.success("Saved locally (demo mode)", { icon: "💾" });
      }
      if (emailOk) {
        toast.success("Confirmation email sent", { icon: "✉️" });
      }
      if (waOk) {
        toast.success("WhatsApp confirmation sent automatically", {
          icon: "💬",
        });
      } else if (waError) {
        toast.error(`WhatsApp not sent: ${waError}`, { duration: 6000 });
      }
      setSuccess(true);
      reset({
        doctorId: selectedDoctor.id,
        departmentId: data.departmentId,
        type: defaultType,
        patientName: "",
        phone: "",
        email: "",
        age: undefined as unknown as number,
        gender: undefined,
        problem: "",
        date: "",
        timeSlot: "",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Booking failed";
      if (message === "SLOT_TAKEN") {
        toast.error("This time slot is already booked. Please choose another.");
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-card/95 p-8 backdrop-blur"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40"
              >
                <CheckCircle2 className="h-10 w-10" />
              </motion.div>
              <h3 className="text-2xl font-bold">{t.appointment.successTitle}</h3>
              <p className="mt-2 max-w-md text-muted-foreground">
                {t.appointment.successMessage}
              </p>
              {lastBookingRef && (
                <p className="mt-2 text-sm font-medium text-primary-700 dark:text-primary-300">
                  Ref: {lastBookingRef}
                </p>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Status: confirmed
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
                  <Mail className="h-3.5 w-3.5" />
                  {emailSent
                    ? "Email sent"
                    : "Email queued (configure RESEND_API_KEY)"}
                </span>
              </div>
              {whatsappSent && (
                <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600/10 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  WhatsApp confirmation sent automatically
                </p>
              )}
              {paymentCtx && (
                <PaymentOptions
                  amount={paymentCtx.amount}
                  patientName={paymentCtx.patientName}
                  patientPhone={paymentCtx.patientPhone}
                  patientEmail={paymentCtx.patientEmail}
                  appointmentId={paymentCtx.appointmentId}
                  doctorName={paymentCtx.doctorName}
                  departmentName={paymentCtx.departmentName}
                  packageName={paymentCtx.packageName}
                />
              )}
              <Button className="mt-6" onClick={() => setSuccess(false)}>
                Book Another
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="overflow-hidden border-border/70 shadow-lift">
        <CardContent className="p-6 md:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 font-semibold",
                backendLabel === "supabase"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              )}
            >
              {backendLabel === "supabase"
                ? "Backend: Supabase"
                : "Backend: Local demo"}
            </span>
            {packageName ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 font-semibold text-primary-800 dark:bg-primary-950 dark:text-primary-200">
                <Package className="h-3 w-3" />
                Package: {packageName}
              </span>
            ) : null}
            {catalogLoading && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading doctors…
              </span>
            )}
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-6"
            noValidate
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="Department"
                error={errors.departmentId?.message}
              >
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <select
                    {...register("departmentId")}
                    className="flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(e) => {
                      setValue("departmentId", e.target.value);
                      setValue("timeSlot", "");
                    }}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>

              <Field label={t.appointment.doctor} error={errors.doctorId?.message}>
                <div className="relative">
                  <Stethoscope className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <select
                    {...register("doctorId")}
                    className="flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(e) => {
                      setValue("doctorId", e.target.value);
                      setValue("timeSlot", "");
                    }}
                  >
                    {doctors.length === 0 ? (
                      <option value="">No doctors in this department</option>
                    ) : (
                      doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                          {d.title ? ` — ${d.title}` : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                {selectedDoctor?.specializations?.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedDoctor.specializations.slice(0, 3).join(" · ")}
                  </p>
                ) : null}
              </Field>

              <Field
                label={t.appointment.patientName}
                error={errors.patientName?.message}
              >
                <Input
                  {...register("patientName")}
                  placeholder="Full name"
                  autoComplete="name"
                />
              </Field>
              <Field label={t.appointment.phone} error={errors.phone?.message}>
                <Input
                  {...register("phone")}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="tel"
                />
              </Field>
              <Field label={t.appointment.email} error={errors.email?.message}>
                <Input
                  {...register("email")}
                  type="email"
                  placeholder="you@email.com"
                  autoComplete="email"
                />
              </Field>
              <Field label={t.appointment.age} error={errors.age?.message}>
                <Input
                  {...register("age")}
                  type="number"
                  min={1}
                  max={120}
                  placeholder="Age"
                />
              </Field>
              <Field label={t.appointment.gender} error={errors.gender?.message}>
                <select
                  {...register("gender")}
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select gender
                  </option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Visit type" error={errors.type?.message}>
                <select
                  {...register("type")}
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="in-person">In-person OPD</option>
                  <option value="video">Video consultation</option>
                </select>
              </Field>
            </div>

            <Field label={t.appointment.problem} error={errors.problem?.message}>
              <Textarea
                {...register("problem")}
                placeholder="Briefly describe your symptoms or reason for visit"
              />
            </Field>

            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <Label className="mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary-600" />
                  {t.appointment.date}
                </Label>
                <Input
                  type="date"
                  min={minDate}
                  max={maxDate}
                  {...register("date")}
                  onChange={(e) => {
                    setValue("date", e.target.value);
                    setValue("timeSlot", "");
                  }}
                />
                {errors.date && (
                  <p className="mt-1 text-xs text-emergency">
                    {errors.date.message}
                  </p>
                )}
                {dayBlocked && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    {dayBlockReason}
                  </p>
                )}
              </div>

              <div>
                <Label className="mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary-600" />
                  {t.appointment.timeSlot}
                </Label>
                <div className="mb-3 flex flex-wrap gap-2">
                  {periods.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        setSelectedPeriod(p.key);
                        setValue("timeSlot", "");
                      }}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                        selectedPeriod === p.key
                          ? "bg-primary-600 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {p.label}
                      {slotGroups[p.key]?.length
                        ? ` (${slotGroups[p.key].length})`
                        : ""}
                    </button>
                  ))}
                </div>
                {availableSlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {selectedDoctor
                      ? "No slots in this period. Try another period or date."
                      : "Select a doctor to see slots."}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {availableSlots.map(({ time, booked }) => {
                      const disabled =
                        booked || !selectedDate || dayBlocked || submitting;
                      return (
                        <button
                          key={time}
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            setValue("timeSlot", time, {
                              shouldValidate: true,
                            })
                          }
                          className={cn(
                            "rounded-xl border px-2 py-2.5 text-xs font-medium transition",
                            disabled
                              ? "cursor-not-allowed border-border bg-muted/50 text-muted-foreground line-through opacity-60"
                              : selectedSlot === time
                                ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-950"
                                : "border-border hover:border-primary-400 hover:bg-primary-50/50"
                          )}
                        >
                          {time}
                          {booked ? " · Booked" : ""}
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.timeSlot && (
                  <p className="mt-1 text-xs text-emergency">
                    {errors.timeSlot.message}
                  </p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full md:w-auto"
              disabled={submitting || dayBlocked || !selectedDoctorId}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.common.loading}
                </>
              ) : (
                t.common.bookAppointment
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-emergency">{error}</p>}
    </div>
  );
}
