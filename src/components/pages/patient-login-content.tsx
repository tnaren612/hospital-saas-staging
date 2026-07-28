"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  patientLoginAction,
  patientRegisterAction,
  patientForgotPasswordAction,
} from "@/lib/patient/actions";

const otpSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter valid 10-digit mobile"),
  otp: z.string().optional(),
});

type OtpValues = z.infer<typeof otpSchema>;
const DEMO_OTP = "123456";

type Mode = "otp" | "login" | "register" | "forgot";

export function PatientLoginContent() {
  const { t } = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("otp");
  const [otpStep, setOtpStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);

  const otpForm = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
  });

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

  const onEmailAuth = (formData: FormData) => {
    setAuthError(null);
    setAuthInfo(null);
    startTransition(async () => {
      if (mode === "login") {
        const res = await patientLoginAction(null, formData);
        if (!res.ok) {
          setAuthError(res.error || "Login failed");
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
        if (res.error) {
          setAuthInfo(res.error);
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
        setAuthInfo(res.error || "Check your email for a reset link.");
        toast.success("Reset email sent (if account exists)");
      }
    });
  };

  return (
    <div className="page-enter">
      <Section className="flex min-h-[70vh] items-center">
        <Card className="mx-auto w-full max-w-md shadow-lift">
          <CardContent className="p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-950">
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
                      : "Sign in with email and password"}
              </p>
            </div>

            <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-muted p-1 text-xs font-semibold">
              {(
                [
                  ["otp", "Phone OTP"],
                  ["login", "Email"],
                  ["register", "Register"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setMode(key);
                    setAuthError(null);
                    setAuthInfo(null);
                  }}
                  className={`flex-1 rounded-lg px-2 py-2 ${
                    mode === key
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "otp" && (
              <form
                onSubmit={otpForm.handleSubmit(onOtpSubmit)}
                className="space-y-4"
                noValidate
              >
                <div>
                  <Label className="mb-2 block">Phone Number</Label>
                  <Input
                    {...otpForm.register("phone")}
                    placeholder="10-digit mobile"
                    maxLength={10}
                    disabled={otpStep === "otp"}
                  />
                  {otpForm.formState.errors.phone && (
                    <p className="mt-1 text-xs text-emergency">
                      {otpForm.formState.errors.phone.message}
                    </p>
                  )}
                </div>
                {otpStep === "otp" && (
                  <div>
                    <Label className="mb-2 block">OTP</Label>
                    <Input
                      {...otpForm.register("otp")}
                      placeholder="Enter 6-digit OTP"
                      maxLength={6}
                      inputMode="numeric"
                    />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : otpStep === "phone" ? (
                    "Send OTP"
                  ) : (
                    "Verify & Login"
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Demo OTP: <strong>123456</strong>
                </p>
              </form>
            )}

            {(mode === "login" ||
              mode === "register" ||
              mode === "forgot") && (
              <form action={onEmailAuth} className="space-y-4">
                {mode === "register" && (
                  <>
                    <div>
                      <Label className="mb-2 block">Full name</Label>
                      <Input name="fullName" required minLength={2} />
                    </div>
                    <div>
                      <Label className="mb-2 block">Phone</Label>
                      <Input
                        name="phone"
                        required
                        maxLength={10}
                        placeholder="10-digit mobile"
                      />
                    </div>
                  </>
                )}
                <div>
                  <Label className="mb-2 block">Email</Label>
                  <Input name="email" type="email" required autoComplete="email" />
                </div>
                {mode !== "forgot" && (
                  <div>
                    <Label className="mb-2 block">Password</Label>
                    <Input
                      name="password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                    />
                  </div>
                )}
                {authError && (
                  <p className="text-xs text-emergency">{authError}</p>
                )}
                {authInfo && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    {authInfo}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === "login" ? (
                    "Sign in"
                  ) : mode === "register" ? (
                    "Create account"
                  ) : (
                    "Send reset link"
                  )}
                </Button>
                {mode === "login" && (
                  <button
                    type="button"
                    className="w-full text-center text-xs font-medium text-primary-700 dark:text-primary-300"
                    onClick={() => setMode("forgot")}
                  >
                    Forgot password?
                  </button>
                )}
                {mode === "forgot" && (
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
              Google / OTP SMS login can be enabled later via Supabase Auth
              providers.{" "}
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
