"use client";

import { useEffect } from "react";

/**
 * Reports Core Web Vitals to analytics / monitoring when configured.
 * Uses PerformanceObserver — no extra dependency required.
 */
export function WebVitalsReporter() {
  useEffect(() => {
    if (typeof window === "undefined" || !("PerformanceObserver" in window)) {
      return;
    }

    const send = (name: string, value: number, id?: string) => {
      const payload = {
        name,
        value: Math.round(name === "CLS" ? value * 1000 : value),
        id: id || `${name}-${Date.now()}`,
        path: window.location.pathname,
        ts: Date.now(),
      };

      // Optional Google Analytics 4
      const w = window as Window & {
        gtag?: (...args: unknown[]) => void;
        dataLayer?: unknown[];
      };
      if (typeof w.gtag === "function") {
        w.gtag("event", name, {
          event_category: "Web Vitals",
          value: payload.value,
          event_label: payload.id,
          non_interaction: true,
        });
      }

      // Beacon to internal monitoring endpoint (best-effort)
      try {
        const body = JSON.stringify(payload);
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/monitoring/vitals", body);
        } else {
          void fetch("/api/monitoring/vitals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          });
        }
      } catch {
        // ignore
      }
    };

    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === "largest-contentful-paint") {
            send("LCP", entry.startTime);
          }
          if (entry.entryType === "first-input") {
            const fid = entry as PerformanceEventTiming;
            send("INP", fid.processingStart - fid.startTime);
          }
          if (entry.entryType === "layout-shift") {
            const ls = entry as PerformanceEntry & {
              value?: number;
              hadRecentInput?: boolean;
            };
            if (!ls.hadRecentInput && typeof ls.value === "number") {
              send("CLS", ls.value);
            }
          }
        }
      });

      po.observe({
        type: "largest-contentful-paint",
        buffered: true,
      } as PerformanceObserverInit);
      po.observe({
        type: "first-input",
        buffered: true,
      } as PerformanceObserverInit);
      po.observe({
        type: "layout-shift",
        buffered: true,
      } as PerformanceObserverInit);

      return () => po.disconnect();
    } catch {
      return;
    }
  }, []);

  return null;
}
