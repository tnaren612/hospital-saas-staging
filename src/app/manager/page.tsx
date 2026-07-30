import type { Metadata } from "next";
import Link from "next/link";
import { createMetadata } from "@/lib/seo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = createMetadata({
  title: "Manager",
  path: "/manager",
  noIndex: true,
});

const links = [
  { href: "/admin/dashboard", label: "Operations dashboard" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/reports", label: "Reports & exports" },
  { href: "/admin/appointments", label: "Appointments" },
  { href: "/reception", label: "Reception queue" },
  { href: "/laboratory", label: "Laboratory" },
  { href: "/pharmacy", label: "Pharmacy" },
  { href: "/billing", label: "Billing" },
  { href: "/finance", label: "Finance" },
  { href: "/hr", label: "HR" },
];

export default function ManagerPortalPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Manager Workspace</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Cross-department oversight — jump to production HMS modules.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <Card key={l.href} className="transition hover:shadow-lift">
            <CardContent className="p-4">
              <Link href={l.href}>
                <Button variant="outline" className="w-full justify-start">
                  {l.label}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
