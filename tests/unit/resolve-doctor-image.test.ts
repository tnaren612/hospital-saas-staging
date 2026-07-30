import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DOCTOR_BANNER,
  DOCTOR_IMAGE_FALLBACK,
  resolveDoctorImage,
  resolveDoctorBannerUrl,
  resolveDoctorProfileUrl,
} from "../../src/lib/doctors/resolve-doctor-image";

describe("resolveDoctorImage", () => {
  it("uses doctor/banner when provided", () => {
    const r = resolveDoctorImage({
      photoUrl: "/images/doctors/profile.jpg",
      bannerUrl: DOCTOR_BANNER,
      gallery: ["/images/doctors/gallery-1.jpg"],
      name: "Dr. Sumanth",
    });
    assert.equal(r.banner, DOCTOR_BANNER);
    assert.equal(r.profile, "/images/doctors/gallery-1.jpg");
    assert.equal(r.alt, "Dr. Sumanth");
  });

  it("prefers doctor gallery photo for profile", () => {
    const r = resolveDoctorImage({
      photoUrl: "/images/doctors/lead-specialist.jpg",
      gallery: [
        "/images/doctors/gallery-1.jpg",
        "/images/doctors/gallery-2.jpg",
      ],
      galleryProfileUrl: "/images/doctors/gallery-1.jpg",
      name: "Dr. Sumanth",
    });
    assert.equal(r.profile, "/images/doctors/gallery-1.jpg");
    assert.equal(r.source, "gallery");
  });

  it("uses record photo when gallery missing", () => {
    const r = resolveDoctorImage({
      photoUrl: "/images/doctors/profile.jpg",
      name: "Dr X",
    });
    assert.equal(r.profile, "/images/doctors/profile.jpg");
    assert.equal(r.source, "record");
  });

  it("falls back to local profile asset", () => {
    const r = resolveDoctorImage({});
    assert.equal(r.profile, DOCTOR_IMAGE_FALLBACK);
    // Banner falls back to dedicated banner constant or profile fallback
    assert.ok(r.banner === DOCTOR_BANNER || r.banner === DOCTOR_IMAGE_FALLBACK);
  });

  it("rejects svg placeholders", () => {
    const r = resolveDoctorImage({
      photoUrl: "/assets/images/doctor/profile.svg",
      bannerUrl: "/assets/images/doctor/banner.svg",
      galleryProfileUrl: "/assets/images/doctor/gallery-1.svg",
    });
    assert.equal(r.profile, DOCTOR_IMAGE_FALLBACK);
  });

  it("resolveDoctorBannerUrl returns doctor/banner", () => {
    assert.equal(resolveDoctorBannerUrl(DOCTOR_BANNER), DOCTOR_BANNER);
  });

  it("resolveDoctorProfileUrl prefers gallery over photo", () => {
    const url = resolveDoctorProfileUrl(
      "/images/doctors/profile.jpg",
      "/images/doctors/gallery-1.jpg"
    );
    assert.equal(url, "/images/doctors/gallery-1.jpg");
  });
});
