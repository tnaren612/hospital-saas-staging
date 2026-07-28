"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, User, KeyRound, Database } from "lucide-react";

export function AdminSettings({
  email,
  name,
  role,
  userId,
  authMode,
}: {
  email: string | null;
  name: string | null;
  role: string | null;
  userId: string | null;
  authMode: "supabase" | "demo";
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Administrator account and security overview
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2 font-semibold">
              <User className="h-5 w-5 text-primary-600" />
              Profile
            </div>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{name || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{email || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Role</dt>
                <dd>
                  <Badge variant="teal">{role || "—"}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">User ID</dt>
                <dd className="break-all font-mono text-xs">{userId || "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2 font-semibold">
              <Shield className="h-5 w-5 text-primary-600" />
              Security
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                Auth mode:{" "}
                <Badge variant={authMode === "supabase" ? "success" : "warning"}>
                  {authMode === "supabase" ? "Supabase Auth" : "Local demo cookie"}
                </Badge>
              </li>
              <li className="flex items-start gap-2">
                <Database className="mt-0.5 h-4 w-4 shrink-0" />
                Admin APIs require authenticated session; service role is never
                sent to the browser.
              </li>
              <li className="flex items-start gap-2">
                <Shield className="mt-0.5 h-4 w-4 shrink-0" />
                Row Level Security: only <code>role = admin</code> can update
                appointments and CMS tables.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Change password</p>
          <p className="mt-2">
            Password resets are managed in Supabase Dashboard → Authentication →
            Users, or via the Supabase password recovery email flow. Do not store
            plaintext passwords in this application.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
