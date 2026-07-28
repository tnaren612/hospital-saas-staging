import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAppointmentReminderMessage,
  getWhatsAppPreviewText,
} from "../../src/lib/notifications/service";
import {
  buildAppointmentSms,
  buildPaymentSms,
} from "../../src/lib/notifications/sms";
import { sanitizePlainText } from "../../src/lib/validation";

describe("notification templates", () => {
  it("builds appointment reminder message", () => {
    const msg = buildAppointmentReminderMessage({
      patientName: "Ravi",
      doctorName: "Dr Sumanth",
      date: "2026-08-01",
      timeSlot: "10:00 AM",
    });
    assert.match(msg, /Ravi/);
    assert.match(msg, /Dr Sumanth/);
    assert.match(msg, /10:00 AM/);
  });

  it("builds WhatsApp preview", () => {
    const text = getWhatsAppPreviewText({
      patientName: "Anitha",
      doctorName: "Dr Sumanth",
      date: "2026-08-02",
      timeSlot: "11:00 AM",
      type: "in-person",
      bookingRef: "SSH-1",
    });
    assert.match(text, /Anitha/);
    assert.match(text, /SSH-1/);
  });

  it("builds compact SMS strings", () => {
    const appt = buildAppointmentSms({
      patientName: "Ravi",
      doctorName: "Dr Sumanth",
      date: "2026-08-01",
      timeSlot: "10:00",
      bookingRef: "REF1",
    });
    assert.ok(appt.length < 200);
    const pay = buildPaymentSms({
      patientName: "Ravi",
      amount: 500,
      invoiceNumber: "INV-1",
    });
    assert.match(pay, /INV-1/);
    assert.match(pay, /500/);
  });
});

describe("sanitizePlainText", () => {
  it("strips angle brackets and control chars", () => {
    const out = sanitizePlainText("<script>alert(1)</script>Hello\u0000");
    assert.equal(out.includes("<"), false);
    assert.equal(out.includes(">"), false);
    assert.match(out, /script/);
    assert.match(out, /Hello/);
  });

  it("respects max length", () => {
    const out = sanitizePlainText("abcdefghij", 5);
    assert.equal(out.length, 5);
  });
});
