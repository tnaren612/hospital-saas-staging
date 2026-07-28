"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RefreshCw, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error?.digest || error?.message);
    try {
      void fetch("/api/monitoring/error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: error?.message,
          digest: error?.digest,
          path: typeof window !== "undefined" ? window.location.pathname : "",
        }),
        keepalive: true,
      });
    } catch {
      // ignore
    }
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16 sm:py-20">
      <div className="max-w-lg text-center">
        <div className="text-7xl font-black tracking-tighter text-destructive/20 sm:text-8xl">
          500
        </div>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          We hit an unexpected error while loading this page. You can try again
          or return home. For urgent medical needs, please call our emergency
          line.
        </p>
        {error?.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:items-center">
          <Button onClick={reset} className="min-h-11">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Link href="/">
            <Button variant="outline" className="w-full min-h-11 min-[400px]:w-auto">
              <Home className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
          <a href="tel:+918121864863">
            <Button
              variant="emergency"
              className="w-full min-h-11 min-[400px]:w-auto"
            >
              <Phone className="h-4 w-4" />
              Emergency
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
