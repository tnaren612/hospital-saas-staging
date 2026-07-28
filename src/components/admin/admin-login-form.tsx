"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import {
  Lock,
  Loader2,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
} from "lucide-react";
import {
  adminLoginSchema,
  type AdminLoginFormValues,
} from "@/lib/validation";
import { adminLoginAction, type AuthActionResult } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PRIMARY_ADMIN_EMAIL } from "@/lib/auth/constants";

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin/dashboard";
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<AdminLoginFormValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: PRIMARY_ADMIN_EMAIL,
      password: "",
      remember: true,
    },
  });

  const remember = watch("remember");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ssh_admin_email");
      if (saved) setValue("email", saved);
      else setValue("email", PRIMARY_ADMIN_EMAIL);
    } catch {
      setValue("email", PRIMARY_ADMIN_EMAIL);
    }
  }, [setValue]);

  const onSubmit = (values: AdminLoginFormValues) => {
    setServerError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", values.email);
      fd.set("password", values.password);
      fd.set("remember", values.remember ? "true" : "false");

      const result: AuthActionResult = await adminLoginAction(null, fd);

      if (!result.ok) {
        setServerError(result.error || "Login failed");
        toast.error(result.error || "Login failed");
        return;
      }

      try {
        if (values.remember) {
          localStorage.setItem("ssh_admin_email", values.email);
        } else {
          localStorage.removeItem("ssh_admin_email");
        }
      } catch {
        // ignore
      }

      toast.success("Welcome back, Admin");
      router.replace(next.startsWith("/admin") ? next : "/admin/dashboard");
      router.refresh();
    });
  };

  return (
    <div className="relative flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-mesh opacity-60 dark:opacity-30" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-lift lg:grid-cols-2">
        <div className="relative hidden bg-hero-gradient p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <Building2 className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold leading-tight">
              Sri Srinivasa Hospital
            </h1>
            <p className="mt-2 text-white/80">Admin Control Center</p>
          </div>
          <ul className="space-y-3 text-sm text-white/85">
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Secure Supabase authentication with role-based access
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Manage appointments, gallery, blog, and doctor profile
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Session cookies · RLS-protected data access
            </li>
          </ul>
          <p className="text-xs text-white/60">
            Unauthorized access is prohibited. Staff and patient accounts cannot
            enter this portal.
          </p>
        </div>

        <Card className="border-0 shadow-none">
          <CardContent className="p-8 sm:p-10">
            <div className="mb-8 text-center lg:text-left">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-950 lg:mx-0">
                <Lock className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-bold">Admin Login</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in with your administrator email and password.
              </p>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-5"
              noValidate
            >
              <div>
                <Label htmlFor="admin-email" className="mb-2 block">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="admin-email"
                    type="email"
                    autoComplete="email"
                    className="pl-10"
                    placeholder={PRIMARY_ADMIN_EMAIL}
                    disabled={pending}
                    {...register("email")}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1.5 text-xs text-emergency" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="admin-password" className="mb-2 block">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="pl-10 pr-11"
                    placeholder="••••••••"
                    disabled={pending}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 text-xs text-emergency" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input text-primary-600 focus:ring-primary-500"
                  checked={Boolean(remember)}
                  onChange={(e) => setValue("remember", e.target.checked)}
                  disabled={pending}
                />
                <span>Remember me</span>
              </label>

              {serverError && (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                  role="alert"
                >
                  {serverError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in to Admin"
                )}
              </Button>
            </form>

            <p
              className={cn(
                "mt-6 text-center text-xs text-muted-foreground lg:text-left"
              )}
            >
              Production login uses Supabase Auth. Only accounts with{" "}
              <code className="rounded bg-muted px-1">profiles.role = admin</code>{" "}
              can enter. Primary admin:{" "}
              <span className="font-medium text-foreground">
                {PRIMARY_ADMIN_EMAIL}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
