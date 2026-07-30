"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Loader2, Mail, Smartphone } from "lucide-react";
import { z } from "zod";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { setPatient } from "@/lib/storage";
import { generateId } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";
import { PASSWORD_POLICY_HINT } from "@/lib/auth/password-policy";
import {
  patientRegisterAction,
  patientForgotPasswordAction,
  patientResendVerificationAction,
} from "@/lib/patient/actions";
import { createClientOrNull } from "@/lib/supabase/client";

const otpSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter valid 10-digit mobile"),
  otp: z.string().optional(),
});

type OtpValues = z.infer<typeof otpSchema>;
const DEMO_OTP = "123456";

type Mode = "otp" | "login" | "register" | "forgot" | "resend";

type Props = {
  /** When true, email auth is primary; demo OTP is hidden (production Supabase). */
  supabaseEnabled?: boolean;
};

export function PatientLoginContent({ supabaseEnabled = false }: Props) {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(supabaseEnabled ? "login" : "otp");
  const [otpStep, setOtpStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);

  const otpForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
  });

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) {
      setAuthError(err);
      setMode("login");
    }
  }, [searchParams]);

  const onOtpSubmit = async (data: OtpValues) => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    if (otpStep === "phone") {
      toast.success(`Demo OTP sent: ${DEMO_OTP}`);
      setOtpStep("otp");
      setLoading(false);
      return;
    }
    if (data.otp !== DEMO_OTP) {
      toast.error("Invalid OTP. Use 123456 for demo.");
      setLoading(false);
      return;
    }
    setPatient({
      id: generateId("pat"),
      name: "Demo Patient",
      phone: data.phone || otpForm.getValues("phone"),
    });
    toast.success("Login successful (demo)");
    router.push("/patient/dashboard");
    setLoading(false);
  };

  const onEmailAuth = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setAuthError(null);
    setAuthInfo(null);
    startTransition(async () => {
      if (mode === "login") {
        const supabase = createClientOrNull();
        if (!supabase) {
          setAuthError("Patient authentication is not configured.");
          return;
        }
        const response = await fetch("/api/patient/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: String(formData.get("email") || "").trim().toLowerCase(),
            password: String(formData.get("password") || ""),
          }),
        });
        const result = (await response.json().catch(() => null)) as {
          error?: string;
          session?: { access_token: string; refresh_token: string };
        } | null;
        if (!response.ok || !result?.session) {
          setAuthError(result?.error || "Login failed");
          return;
        }
        const { error } = await supabase.auth.setSession(result.session);
        if (error) {
          setAuthError(error.message || "Login failed");
          return;
        }
        toast.success("Signed in");
        router.push("/patient/dashboard");
        router.refresh();
        return;
      }
      if (mode === "register") {
        const res = await patientRegisterAction(null, formData);
        if (!res.ok) {
          setAuthError(res.error || "Registration failed");
          return;
        }
        if (res.info) {
          setAuthInfo(res.info);
          toast.success("Registered — verify email if required");
          setMode("login");
          return;
        }
        toast.success("Account created");
        router.push("/patient/dashboard");
        router.refresh();
        return;
      }
      if (mode === "forgot") {
        const res = await patientForgotPasswordAction(null, formData);
        if (!res.ok) {
          setAuthError(res.error || "Request failed");
          return;
        }
        setAuthInfo(res.info || "Check your email for a reset link.");
        toast.success("If the account exists, a reset email was sent");
        return;
      }
      if (mode === "resend") {
        const res = await patientResendVerificationAction(null, formData);
        if (!res.ok) {
          setAuthError(res.error || "Request failed");
          return;
        }
        setAuthInfo(res.info || "Verification email sent if needed.");
        toast.success("Request submitted");
      }
    });
  };

  const modes: { key: Mode; label: string; show: boolean }[] = [
    { key: "otp", label: "Phone OTP", show: !supabaseEnabled },
    { key: "login", label: "Email", show: true },
    { key: "register", label: "Register", show: true },
  ];

  return (
    <div className="page-enter">
      <Section className="flex min-h-[70vh] items-center">
        <Card className="mx-auto w-full max-w-md shadow-lift">
          <CardContent className="p-8">
            <div className="mb-6 text-center">
              <div
                className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-950"
                aria-hidden
              >
                {mode === "otp" ? (
                  <Smartphone className="h-7 w-7" />
                ) : (
                  <Mail className="h-7 w-7" />
                )}
              </div>
              <h1 className="text-2xl font-bold">{t.patient.login}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "otp"
                  ? t.patient.otpHint
                  : mode === "register"
                    ? "Create a secure patient account"
                    : mode === "forgot"
                      ? "Reset your password via email"
                      : mode === "resend"
                        ? "Resend email verification link"
                        : "Sign in with email and password"}
              </p>
            </div>

            <div
              className="mb-4 flex flex-wrap gap-1 rounded-xl bg-muted p-1 text-xs font-semibold"
              role="tablist"
              aria-label="Login method"
            >
              {modes
                .filter((m) => m.show)
                .map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={mode === key}
                    onClick={() => {
                      setMode(key);
                      setAuthError(null);
                      setAuthInfo(null);
                    }}
                    className={`flex-1 rounded-lg px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                      mode === key
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
            </div>

            {mode === "otp" && !supabaseEnabled && (
              <form
                onSubmit={otpForm.handleSubmit(onOtpSubmit)}
                className="space-y-4"
                noValidate
              >
                <div>
                  <Label htmlFor="otp-phone" className="mb-2 block">
                    Phone Number
                  </Label>
                  <Input
                    id="otp-phone"
                    {...otpForm.register("phone")}
                    placeholder="10-digit mobile"
                    maxLength={10}
                    disabled={otpStep === "otp"}
                    autoComplete="tel"
                    inputMode="numeric"
                  />
                  {otpForm.formState.errors.phone && (
                    <p className="mt-1 text-xs text-emergency" role="alert">
                      {otpForm.formState.errors.phone.message}
                    </p>
                  )}
                </div>
                {otpStep === "otp" && (
                  <div>
                    <Label htmlFor="otp-code" className="mb-2 block">
                      OTP
                    </Label>
                    <Input
                      id="otp-code"
                      {...otpForm.register("otp")}
                      placeholder="Enter 6-digit OTP"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : otpStep === "phone" ? (
                    "Send OTP"
                  ) : (
                    "Verify & Login"
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Demo OTP: <strong>123456</strong> (local only)
                </p>
              </form>
            )}

            {(mode === "login" ||
              mode === "register" ||
              mode === "forgot" ||
              mode === "resend") && (
              <form onSubmit={onEmailAuth} className="space-y-4" noValidate>
                {mode === "register" && (
                  <>
                    <div>
                      <Label htmlFor="fullName" className="mb-2 block">
                        Full name
                      </Label>
                      <Input
                        id="fullName"
                        name="fullName"
                        required
                        minLength={2}
                        autoComplete="name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="mb-2 block">
                        Phone
                      </Label>
                      <Input
                        id="phone"
                        name="phone"
                        required
                        maxLength={10}
                        placeholder="10-digit mobile"
                        inputMode="numeric"
                        autoComplete="tel"
                      />
                    </div>
                  </>
                )}
                <div>
                  <Label htmlFor="email" className="mb-2 block">
                    Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                  />
                </div>
                {(mode === "login" || mode === "register") && (
                  <div>
                    <Label htmlFor="password" className="mb-2 block">
                      Password
                    </Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      required
                      minLength={mode === "register" ? 8 : 1}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                    />
                    {mode === "register" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {PASSWORD_POLICY_HINT}
                      </p>
                    )}
                  </div>
                )}
                {mode === "register" && (
                  <div>
                    <Label htmlFor="confirmPassword" className="mb-2 block">
                      Confirm password
                    </Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                )}
                {authError && (
                  <p className="text-xs text-emergency" role="alert">
                    {authError}
                  </p>
                )}
                {authInfo && (
                  <p
                    className="text-xs text-emerald-700 dark:text-emerald-300"
                    role="status"
                  >
                    {authInfo}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : mode === "login" ? (
                    "Sign in"
                  ) : mode === "register" ? (
                    "Create account"
                  ) : mode === "resend" ? (
                    "Resend verification"
                  ) : (
                    "Send reset link"
                  )}
                </Button>
                {mode === "login" && (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="w-full text-center text-xs font-medium text-primary-700 dark:text-primary-300"
                      onClick={() => setMode("forgot")}
                    >
                      Forgot password?
                    </button>
                    <button
                      type="button"
                      className="w-full text-center text-xs font-medium text-muted-foreground"
                      onClick={() => setMode("resend")}
                    >
                      Resend verification email
                    </button>
                  </div>
                )}
                {(mode === "forgot" || mode === "resend") && (
                  <button
                    type="button"
                    className="w-full text-center text-xs font-medium text-primary-700"
                    onClick={() => setMode("login")}
                  >
                    Back to sign in
                  </button>
                )}
              </form>
            )}

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Staff and doctors use{" "}
              <Link href="/admin/login" className="underline">
                staff login
              </Link>
              .{" "}
              <Link href="/appointment" className="underline">
                Book without login
              </Link>
            </p>
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
