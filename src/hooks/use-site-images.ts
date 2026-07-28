"use client";

/**
 * Client hooks for Gallery-driven site images.
 */

import { useEffect, useState } from "react";
import {
  resolveDoctorGallery,
  resolveDoctorMedia,
  resolveHomeSliderImages,
  resolveHospitalBuilding,
  type SiteImage,
  LOCAL_SITE_IMAGES,
} from "@/lib/gallery/site-images";

export function useHospitalBuildingImage(hospitalName?: string) {
  const [image, setImage] = useState<SiteImage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void resolveHospitalBuilding(hospitalName)
      .then((img) => {
        if (!cancelled) {
          setImage(img);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImage({
            url: LOCAL_SITE_IMAGES.hospitalBuilding,
            alt: hospitalName || "Hospital building",
            source: "local",
          });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hospitalName]);

  return {
    image,
    loading,
    url: image?.url || LOCAL_SITE_IMAGES.hospitalBuilding,
    alt: image?.alt || hospitalName || "Hospital building",
  };
}

export function useDoctorSiteMedia(input?: {
  photoUrl?: string | null;
  name?: string;
  slug?: string | null;
}) {
  const [profile, setProfile] = useState<SiteImage | null>(null);
  const [banner, setBanner] = useState<SiteImage | null>(null);
  const [loading, setLoading] = useState(true);

  const photoUrl = input?.photoUrl || "";
  const name = input?.name || "";
  const slug = input?.slug || "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void resolveDoctorMedia({
      photoUrl: photoUrl || null,
      name: name || undefined,
      slug: slug || null,
    })
      .then((r) => {
        if (!cancelled) {
          setProfile(r.profile);
          setBanner(r.banner);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile({
            url: LOCAL_SITE_IMAGES.doctorProfile,
            alt: name || "Doctor",
            source: "local",
          });
          setBanner({
            url: LOCAL_SITE_IMAGES.hospitalHero,
            alt: "Banner",
            source: "local",
          });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [photoUrl, name, slug]);

  return {
    profile,
    banner,
    loading,
    profileUrl: profile?.url || LOCAL_SITE_IMAGES.doctorProfile,
    profileAlt: profile?.alt || name || "Doctor",
    bannerUrl: banner?.url || LOCAL_SITE_IMAGES.hospitalHero,
    bannerAlt: banner?.alt || "Doctor banner",
  };
}

export function useHomeSliderImages(hospitalName?: string) {
  const [images, setImages] = useState<SiteImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void resolveHomeSliderImages(hospitalName)
      .then((rows) => {
        if (!cancelled) {
          setImages(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImages([
            {
              url: LOCAL_SITE_IMAGES.hospitalHero,
              alt: hospitalName || "Hospital",
              source: "local",
            },
            {
              url: LOCAL_SITE_IMAGES.doctorProfile,
              alt: "Lead specialist",
              source: "local",
            },
          ]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hospitalName]);

  return { images, loading };
}

export function useDoctorGalleryImages(name?: string) {
  const [images, setImages] = useState<SiteImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void resolveDoctorGallery(name)
      .then((rows) => {
        if (!cancelled) {
          setImages(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImages(
            LOCAL_SITE_IMAGES.doctorGallery.map((url, i) => ({
              url,
              alt: `${name || "Doctor"} gallery ${i + 1}`,
              source: "local" as const,
            }))
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return { images, loading };
}
