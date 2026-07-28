"use client";

import { useTransition, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { patientUpdatePasswordAction } from "@/lib/patient/actions";

export default function PatientResetPasswordPage() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <Section className="flex min-h-[60vh] items-center">
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="space-y-4 p-8">
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="text-sm text-muted-foreground">
            Open this page from your password reset email link, then choose a
            new password.
          </p>
          <form
            action={(fd) => {
              setMsg(null);
              start(async () => {
                const res = await patientUpdatePasswordAction(null, fd);
                if (!res.ok) {
                  setMsg(res.error || "Failed");
                  return;
                }
                toast.success("Password updated");
                setMsg("Password updated. You can sign in now.");
              });
            }}
            className="space-y-4"
          >
            <div>
              <Label className="mb-2 block">New password</Label>
              <Input
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            {msg && (
              <p className="text-xs text-muted-foreground">{msg}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
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
