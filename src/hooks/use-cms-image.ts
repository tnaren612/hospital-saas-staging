"use client";

import { useEffect, useState } from "react";
import {
  getBanner,
  getImage,
  getImages,
  getImagesByKey,
  type CmsImage,
} from "@/lib/image-service";

export function useCmsImage(section: string, key: string) {
  const [image, setImage] = useState<CmsImage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getImage(section, key)
      .then((img) => {
        if (!cancelled) {
          setImage(img);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImage(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [section, key]);

  return {
    image,
    loading,
    url: image?.image_url || "",
    alt: image?.alt_text || "",
  };
}

export function useCmsImages(section: string) {
  const [images, setImages] = useState<CmsImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getImages(section)
      .then((rows) => {
        if (!cancelled) {
          setImages(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImages([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [section]);

  return { images, loading };
}

export function useCmsImagesByKey(section: string, key: string) {
  const [images, setImages] = useState<CmsImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getImagesByKey(section, key)
      .then((rows) => {
        if (!cancelled) {
          setImages(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImages([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [section, key]);

  return { images, loading };
}

export function useCmsBanner(section: string) {
  const [image, setImage] = useState<CmsImage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getBanner(section)
      .then((img) => {
        if (!cancelled) {
          setImage(img);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImage(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [section]);

  return {
    image,
    loading,
    url: image?.image_url || "",
    alt: image?.alt_text || "",
  };
}
