"use client";

import { useEffect, useState } from "react";
import type {
  CmsAnnouncement,
  CmsNavigationItem,
} from "@/lib/cms/types";

type CmsSite = {
  header: CmsNavigationItem[];
  footer: CmsNavigationItem[];
  utility: CmsNavigationItem[];
  announcement: CmsAnnouncement | null;
};

const emptySite: CmsSite = {
  header: [],
  footer: [],
  utility: [],
  announcement: null,
};

let siteCache: CmsSite | null = null;

export function useCmsSite() {
  const [site, setSite] = useState<CmsSite>(siteCache || emptySite);
  useEffect(() => {
    if (siteCache) return;
    let active = true;
    void fetch("/api/cms/site")
      .then((response) => response.json())
      .then((json) => {
        const next: CmsSite = { ...emptySite, ...(json.data || {}) };
        siteCache = next;
        if (active) setSite(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return site;
}
