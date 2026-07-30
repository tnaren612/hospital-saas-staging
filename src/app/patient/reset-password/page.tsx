"use client";

import { useTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { patientUpdatePasswordAction } from "@/lib/patient/actions";
import { PASSWORD_POLICY_HINT } from "@/lib/auth/password-policy";

export default function PatientResetPasswordPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Section className="flex min-h-[60vh] items-center">
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="space-y-4 p-8">
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="text-sm text-muted-foreground">
            Open this page from your password reset email link, then choose a
            new password. {PASSWORD_POLICY_HINT}.
          </p>
          <form
            action={(fd) => {
              setMsg(null);
              setError(null);
              start(async () => {
                const res = await patientUpdatePasswordAction(null, fd);
                if (!res.ok) {
                  setError(res.error || "Failed");
                  return;
                }
                toast.success("Password updated");
                setMsg(res.info || "Password updated. You can sign in now.");
                setTimeout(() => router.push("/patient/login"), 1500);
              });
            }}
            className="space-y-4"
            noValidate
          >
            <div>
              <Label htmlFor="password" className="mb-2 block">
                New password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
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
            {error && (
              <p className="text-xs text-emergency" role="alert">
                {error}
              </p>
            )}
            {msg && (
              <p className="text-xs text-emerald-700" role="status">
                {msg}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                "Update password"
              )}
            </Button>
          </form>
          <Link
            href="/patient/login"
            className="block text-center text-sm text-primary-700 underline"
          >
            Back to login
          </Link>
        </CardContent>
      </Card>
    </Section>
  );
}
