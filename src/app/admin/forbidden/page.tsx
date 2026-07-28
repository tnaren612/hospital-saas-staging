import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { createMetadata } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { adminLogoutAction } from "@/lib/auth/actions";

export const metadata: Metadata = createMetadata({
  title: "403 Access Denied",
  path: "/admin/forbidden",
  noIndex: true,
});

export default function AdminForbiddenPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/50">
          <ShieldX className="h-8 w-8" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-wider text-emergency">
          403
        </p>
        <h1 className="mt-2 text-3xl font-bold">Access Denied</h1>
        <p className="mt-3 text-muted-foreground">
          You are signed in, but your account does not have the{" "}
          <strong>admin</strong> role. Staff and patient accounts cannot access
          the admin portal.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/">
            <Button variant="outline">Back to website</Button>
          </Link>
          <form action={adminLogoutAction}>
            <Button type="submit" variant="emergency">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
