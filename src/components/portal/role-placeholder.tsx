import Link from "next/link";
import { Construction, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/auth/roles";

/**
 * Placeholder for role portals that do not yet have a full dedicated UI.
 * Does not invent dashboards — marks missing functionality clearly.
 */
export function RolePlaceholder({
  role,
  title,
  description,
  existingLinks = [],
}: {
  role: string;
  title: string;
  description?: string;
  existingLinks?: { href: string; label: string }[];
}) {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <Card className="border-dashed">
        <CardContent className="space-y-4 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <Construction className="h-7 w-7" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {roleLabel(role)} portal
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {description ||
              "Access Not Yet Implemented. This role is recognized by RBAC; a dedicated workspace will be added in a later phase."}
          </p>
          {existingLinks.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {existingLinks.map((l) => (
                <Link key={l.href} href={l.href}>
                  <Button variant="outline" size="sm">
                    {l.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              ))}
            </div>
          )}
          <p className="pt-4 text-[11px] text-muted-foreground">
            TODO: Build full {title} dashboard modules.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
