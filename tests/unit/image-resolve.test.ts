import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidImageSrc,
  resolveImageSrc,
  serviceImageForId,
  defaultDoctorImage,
} from "../../src/lib/assets/image-resolve";

describe("image-resolve", () => {
  it("rejects empty and invalid src", () => {
    assert.equal(isValidImageSrc(""), false);
    assert.equal(isValidImageSrc(null), false);
    assert.equal(isValidImageSrc("undefined"), false);
    assert.equal(isValidImageSrc("not-a-path"), false);
  });

  it("accepts public paths and https URLs", () => {
    assert.equal(isValidImageSrc("/assets/images/doctor/profile.svg"), true);
    assert.equal(
      isValidImageSrc("https://images.unsplash.com/photo-x?w=400"),
      true
    );
  });

  it("resolves first valid candidate", () => {
    assert.equal(
      resolveImageSrc(["", null, "/ok.svg"], "/fallback.svg"),
      "/ok.svg"
    );
    assert.equal(resolveImageSrc([null, ""], "/fallback.svg"), "/fallback.svg");
  });

  it("maps service ids to local photo assets", () => {
    assert.ok(serviceImageForId("pulmonology").includes("pulmonology.jpg"));
    assert.ok(serviceImageForId("asthma-care").includes("asthma.jpg"));
    assert.ok(serviceImageForId("unknown-id").startsWith("/images/"));
  });

  it("prefers configured photo over svg placeholder", () => {
    assert.ok(
      serviceImageForId("pulmonology", "/assets/images/services/pulmonology.svg").endsWith(
        ".jpg"
      )
    );
    assert.equal(
      serviceImageForId("pulmonology", "/images/services/custom.jpg"),
      "/images/services/custom.jpg"
    );
  });

  it("provides doctor default photo", () => {
    assert.ok(defaultDoctorImage().includes("doctors"));
    assert.ok(defaultDoctorImage().endsWith(".jpg"));
  });
});

