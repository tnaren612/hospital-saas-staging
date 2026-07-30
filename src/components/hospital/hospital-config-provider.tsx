"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { HospitalConfig, ModuleKey } from "@/lib/hospital/types";
import { buildDefaultHospitalConfig } from "@/lib/hospital/defaults";

type Ctx = {
  config: HospitalConfig;
  loading: boolean;
  refresh: () => Promise<void>;
  isModuleEnabled: (m: ModuleKey) => boolean;
};

const HospitalConfigContext = createContext<Ctx>({
  config: buildDefaultHospitalConfig(),
  loading: true,
  refresh: async () => {},
  isModuleEnabled: () => true,
});

export function HospitalConfigProvider({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: HospitalConfig | null;
}) {
  const [config, setConfig] = useState<HospitalConfig>(
    initial || buildDefaultHospitalConfig()
  );
  const [loading, setLoading] = useState(!initial);

  const refresh = useCallback(async () => {
    try {
      // Use HTTP cache (API sets s-maxage) — do not force no-store on every nav
      const res = await fetch("/api/hospital/config");
      const json = await res.json();
      if (res.ok && json.data) setConfig(json.data as HospitalConfig);
    } catch {
      /* keep defaults */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initial) {
      // Defer config fetch so first paint of marketing/appointment is not blocked
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        const id = (
          window as Window & {
            requestIdleCallback: (cb: () => void) => number;
          }
        ).requestIdleCallback(() => {
          void refresh();
        });
        return () => {
          (
            window as Window & {
              cancelIdleCallback?: (id: number) => void;
            }
          ).cancelIdleCallback?.(id);
        };
      }
      const t = globalThis.setTimeout(() => void refresh(), 0);
      return () => globalThis.clearTimeout(t);
    }
    setLoading(false);
  }, [initial, refresh]);

  // Apply CSS brand variables (including Tailwind --primary HSL channels)
  useEffect(() => {
    const root = document.documentElement;
    const p = config.branding.primary_color || "#1a5ff5";
    const s = config.branding.secondary_color || "#0d9488";
    root.style.setProperty("--hospital-primary", p);
    root.style.setProperty("--hospital-secondary", s);
    root.style.setProperty("--brand-primary", p);
    // Convert hex → HSL channels for hsl(var(--primary))
    const hex = p.replace("#", "");
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let sat = 0;
      const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
          case g:
            h = ((b - r) / d + 2) / 6;
            break;
          default:
            h = ((r - g) / d + 4) / 6;
        }
      }
      const channels = `${Math.round(h * 360)} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%`;
      root.style.setProperty("--primary", channels);
      root.style.setProperty("--ring", channels);
    }
    if (typeof document !== "undefined") {
      document.title =
        config.seo.meta_title || config.branding.name || document.title;
      const fav = config.branding.favicon_url;
      if (fav) {
        let link = document.querySelector(
          "link[rel='icon']"
        ) as HTMLLinkElement | null;
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = fav;
      }
    }
  }, [config]);

  const value = useMemo(
    () => ({
      config,
      loading,
      refresh,
      isModuleEnabled: (m: ModuleKey) => Boolean(config.modules[m]),
    }),
    [config, loading, refresh]
  );

  return (
    <HospitalConfigContext.Provider value={value}>
      {children}
    </HospitalConfigContext.Provider>
  );
}

export function useHospitalConfig() {
  return useContext(HospitalConfigContext);
}
