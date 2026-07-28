"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "react-hot-toast";
import { useState } from "react";
import { LocaleProvider } from "@/hooks/use-locale";
import { AccessibilityProvider } from "@/hooks/use-accessibility";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <LocaleProvider>
          <AccessibilityProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                className: "text-sm font-medium",
                duration: 4000,
                style: {
                  borderRadius: "12px",
                  background: "hsl(var(--card))",
                  color: "hsl(var(--card-foreground))",
                  border: "1px solid hsl(var(--border))",
                },
              }}
            />
          </AccessibilityProvider>
        </LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
