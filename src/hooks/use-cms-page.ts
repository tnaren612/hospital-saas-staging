"use client";

import { useEffect, useState } from "react";
import type { CmsPage, CmsPageKey } from "@/lib/cms/types";

const cache = new Map<string, CmsPage | null>();

export function useCmsPage(pageKey: CmsPageKey) {
  const [page, setPage] = useState<CmsPage | null>(
    () => cache.get(pageKey) ?? null
  );
  const [loading, setLoading] = useState(!cache.has(pageKey));

  useEffect(() => {
    let active = true;
    if (cache.has(pageKey)) {
      setPage(cache.get(pageKey) ?? null);
      setLoading(false);
      return;
    }
    void fetch(`/api/cms/page?key=${encodeURIComponent(pageKey)}`)
      .then((response) => response.json())
      .then((json) => {
        const next = (json.data || null) as CmsPage | null;
        cache.set(pageKey, next);
        if (active) setPage(next);
      })
      .catch(() => {
        cache.set(pageKey, null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pageKey]);

  return { page, loading };
}
