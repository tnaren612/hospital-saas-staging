"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Lock, Loader2 } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { isAdminAuthenticated, setAdminAuthenticated } from "@/lib/storage";

export function AdminLoginContent() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdminAuthenticated()) {
      router.replace("/admin/dashboard");
    }
  }, [router]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    // Demo password
    if (password === "admin123") {
      setAdminAuthenticated(true);
      toast.success("Welcome, Admin");
      router.push("/admin/dashboard");
    } else {
      toast.error("Invalid password. Demo: admin123");
    }
    setLoading(false);
  };

  return (
    <Section className="flex min-h-[70vh] items-center">
      <Card className="mx-auto w-full max-w-md shadow-lift">
        <CardContent className="p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-950">
              <Lock className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold">Admin Portal</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Demo password: <strong>admin123</strong>
            </p>
          </div>
          <form onSubmit={login} className="space-y-4">
            <div>
              <Label className="mb-2 block">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Section>
  );
}
