import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { emailTemplateService } from "../../src/lib/notifications/templates/email-templates";
import {
  renderWhatsAppMessage,
  renderSmsMessage,
} from "../../src/lib/notifications/templates/message-templates";
import {
  generateWhatsAppLink,
  normalizeWhatsAppDigits,
} from "../../src/lib/notifications/providers/whatsapp/click-to-chat-provider";
import { MockSmsProvider } from "../../src/lib/notifications/providers/sms/mock-sms-provider";
import { MockEmailProvider } from "../../src/lib/notifications/providers/email/mock-email-provider";
import {
  isChannelAllowed,
  normalizePreferences,
  DEFAULT_PREFERENCES,
} from "../../src/lib/notifications/core/preferences";
import {
  resetNotificationRepositoryForTests,
  InMemoryNotificationRepository,
} from "../../src/lib/notifications/repository";
import {
  NotificationService,
  resetNotificationServiceForTests,
} from "../../src/lib/notifications/notification-service";
import {
  matchingReminderWindows,
  parseTimeSlot,
  appointmentStartMs,
} from "../../src/lib/notifications/reminder-scheduler";
import { NotificationFactory } from "../../src/lib/notifications/core/factory";

describe("EmailTemplateService", () => {
  it("renders all required templates", () => {
    const ids = emailTemplateService.listTemplateIds();
    for (const id of [
      "welcome",
      "appointment_confirmation",
      "appointment_reminder",
      "appointment_cancelled",
      "appointment_rescheduled",
      "payment_success",
      "payment_failed",
      "invoice",
      "password_reset",
      "lab_report_ready",
      "prescription_ready",
      "emergency",
    ]) {
      assert.ok(ids.includes(id), `missing ${id}`);
      const r = emailTemplateService.render(id, {
        patientName: "Ravi",
        doctorName: "Dr Sumanth",
        date: "2026-08-01",
        timeSlot: "10:00 AM",
        invoiceNumber: "INV-1",
        amount: 500,
        hospitalName: "SSH",
        resetUrl: "https://example.com/reset",
        message: "Test",
      });
      assert.ok(r.subject.length > 2);
      assert.ok(r.text.length > 2);
      assert.ok(r.html.includes("<!DOCTYPE html>") || r.html.includes("<html"));
    }
  });
});

describe("WhatsApp link generator", () => {
  it("normalizes 10-digit Indian numbers", () => {
    assert.equal(normalizeWhatsAppDigits("9876543210"), "919876543210");
  });

  it("builds wa.me URL with encoded text", () => {
    const url = generateWhatsAppLink("9876543210", "Hello World");
    assert.ok(url.startsWith("https://wa.me/919876543210?text="));
    assert.ok(url.includes("Hello"));
  });

  it("renders appointment confirmation message", () => {
    const msg = renderWhatsAppMessage("appointment_confirmation", {
      patientName: "Ravi",
      doctorName: "Dr Sumanth",
      departmentName: "Pulmonology",
      hospitalName: "Demo Hospital",
      date: "2026-08-01",
      timeSlot: "10:00 AM",
      type: "in-person",
      bookingRef: "REF1",
      appointmentId: "APT-1",
    });
    assert.match(msg, /Hello Ravi/);
    assert.match(msg, /Your appointment has been confirmed/);
    assert.match(msg, /Demo Hospital/);
    assert.match(msg, /Dr Sumanth/);
    assert.match(msg, /Pulmonology/);
    assert.match(msg, /2026-08-01/);
    assert.match(msg, /10:00 AM/);
    assert.match(msg, /APT-1/);
  });
});

describe("SMS mock provider", () => {
  it("returns preview for valid phone", async () => {
    const p = new MockSmsProvider();
    const r = await p.send({
      recipient: "9876543210",
      subject: "test",
      text: "Hello SMS",
    });
    assert.equal(r.ok, true);
    assert.equal(r.preview, "Hello SMS");
  });

  it("rejects short numbers", async () => {
    const p = new MockSmsProvider();
    const r = await p.send({
      recipient: "123",
      subject: "t",
      text: "x",
    });
    assert.equal(r.ok, false);
  });

  it("renders compact SMS templates", () => {
    const s = renderSmsMessage("payment_success", {
      amount: 500,
      invoiceNumber: "INV-1",
      patientName: "Ravi",
    });
    assert.ok(s.length < 200);
    assert.match(s, /INV-1/);
  });
});

describe("Mock email provider", () => {
  it("always succeeds", async () => {
    const p = new MockEmailProvider();
    const r = await p.send({
      recipient: "a@b.com",
      subject: "Hi",
      text: "Body",
    });
    assert.equal(r.ok, true);
  });
});

describe("Preference logic", () => {
  it("defaults allow email/whatsapp, not sms", () => {
    assert.equal(isChannelAllowed(DEFAULT_PREFERENCES, "email"), true);
    assert.equal(isChannelAllowed(DEFAULT_PREFERENCES, "whatsapp"), true);
    assert.equal(isChannelAllowed(DEFAULT_PREFERENCES, "sms"), false);
  });

  it("all flag enables every channel", () => {
    const p = normalizePreferences({ all: true });
    assert.equal(isChannelAllowed(p, "sms"), true);
    assert.equal(isChannelAllowed(p, "email"), true);
  });

  it("respects disabled email", () => {
    const p = normalizePreferences({ email: false, whatsapp: true, sms: false });
    assert.equal(isChannelAllowed(p, "email"), false);
    assert.equal(isChannelAllowed(p, "whatsapp"), true);
  });
});

describe("NotificationService + repository", () => {
  let svc: NotificationService;

  beforeEach(() => {
    resetNotificationRepositoryForTests(new InMemoryNotificationRepository());
    resetNotificationServiceForTests();
    svc = new NotificationService(
      new InMemoryNotificationRepository(),
      new NotificationFactory()
    );
  });

  it("sends mock email and stores history", async () => {
    const r = await svc.send({
      channel: "email",
      templateId: "welcome",
      recipient: "patient@example.com",
      force: true,
      vars: { patientName: "Ravi", hospitalName: "SSH" },
    });
    assert.equal(r.ok, true);
    assert.ok(r.notificationId);
    const list = await svc.list({ page: 1, pageSize: 10 });
    assert.ok(list.total >= 1);
    assert.equal(list.data[0].channel, "email");
  });

  it("uses meta provider for whatsapp (not wa_me)", async () => {
    const r = await svc.send({
      channel: "whatsapp",
      templateId: "appointment_confirmation",
      recipient: "9876543210",
      force: true,
      provider: "meta",
      vars: {
        patientName: "Ravi",
        doctorName: "Dr S",
        date: "2026-08-01",
        timeSlot: "10:00 AM",
        appointmentId: "APT-1",
      },
    });
    // Without Meta credentials, send fails but provider must be meta
    assert.equal(r.provider, "meta");
    assert.equal(r.channel, "whatsapp");
    assert.ok(r.notificationId);
    assert.ok(!("actionUrl" in r && (r as { actionUrl?: string }).actionUrl));
    if (r.preview) {
      assert.match(r.preview, /Ravi/);
      assert.match(r.preview, /confirmed/i);
    }
  });

  it("skips disabled channel when not forced", async () => {
    await svc.savePreferences("p1", {
      email: false,
      whatsapp: true,
      sms: false,
      all: false,
    });
    const r = await svc.send({
      channel: "email",
      templateId: "welcome",
      recipient: "x@y.com",
      patientId: "p1",
      force: false,
      vars: { patientName: "Ravi" },
    });
    assert.equal(r.status, "skipped");
  });

  it("retries failed notification", async () => {
    const first = await svc.send({
      channel: "sms",
      templateId: "generic",
      recipient: "9876543210",
      force: true,
      vars: { message: "Hi" },
    });
    assert.ok(first.notificationId);
    const second = await svc.retry(first.notificationId!);
    assert.equal(second.ok, true);
  });

  it("computes stats", async () => {
    await svc.send({
      channel: "email",
      templateId: "generic",
      recipient: "a@b.com",
      force: true,
      vars: { message: "x", subject: "s" },
    });
    const s = await svc.stats();
    assert.ok(s.total >= 1);
  });
});

describe("Reminder scheduler", () => {
  it("parses 12h and 24h times", () => {
    assert.deepEqual(parseTimeSlot("10:00 AM"), { h: 10, m: 0 });
    assert.deepEqual(parseTimeSlot("14:30"), { h: 14, m: 30 });
  });

  it("matches 30m window within tolerance", () => {
    const date = "2030-01-15";
    const time = "10:00 AM";
    const start = appointmentStartMs(date, time)!;
    const now = start - 30 * 60 * 1000;
    const windows = matchingReminderWindows(date, time, now);
    assert.ok(windows.includes("30m"));
  });
});
