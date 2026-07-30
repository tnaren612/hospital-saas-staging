import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDefaultHospitalConfig } from "../../src/lib/hospital/defaults";
import { toPublicHospitalConfig } from "../../src/lib/hospital/public-config";

describe("public hospital configuration", () => {
  it("keeps public identity while redacting operational settings", () => {
    const config = buildDefaultHospitalConfig();
    config.payments.upi_id = "private@upi";
    config.payments.bank_details = "private bank details";
    config.email.from_email = "private@example.com";
    config.email.smtp_host_hint = "smtp.private.example";
    config.storage.public_base_url = "https://private.example";
    config.templates.sms_signature = "PRIVATE";

    const result = toPublicHospitalConfig(config);

    assert.equal(result.branding.name, config.branding.name);
    assert.equal(result.contact.emergency_phone, config.contact.emergency_phone);
    assert.equal(result.payments.upi_id, "");
    assert.equal(result.payments.bank_details, "");
    assert.equal(result.email.from_email, "");
    assert.equal(result.email.smtp_host_hint, "");
    assert.equal(result.storage.public_base_url, "");
    assert.equal(result.templates.sms_signature, "");
  });
});
