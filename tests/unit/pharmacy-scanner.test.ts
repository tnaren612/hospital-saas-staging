import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type IndexedMedicine,
  buildMedicineIndex,
  findMedicineBySku,
  resolveScan,
} from "../../src/lib/pharmacy/barcode/scan";
import {
  type ScanEvent,
  classifyTypingSource,
  createScanPipeline,
} from "../../src/lib/pharmacy/barcode/transport";
import {
  type BluetoothDeviceLike,
  type BluetoothServerLike,
  MobileScannerGattTransport,
  decodeBarcodePayload,
  isWebBluetoothSupported,
} from "../../src/lib/pharmacy/barcode/bluetooth";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const meds: IndexedMedicine[] = [
  { id: "m1", name: "Paracetamol 500", sku: "8901234567890" },
  { id: "m2", name: "Amoxicillin 250", sku: "MED-ABC-123" },
  { id: "m3", name: "ORS Sachet", sku: null, barcode: "036000291450" },
  { id: "m4", name: "Vit-D3 Drops", sku: "VITD-001", barcode: "VITD-001" },
];

const index = buildMedicineIndex(meds);

type Harness = {
  events: ScanEvent<IndexedMedicine>[];
  advance: (ms: number) => void;
  pipeline: ReturnType<typeof createScanPipeline<IndexedMedicine>>;
};

function makeHarness(maxRawLength = 128): Harness {
  const events: ScanEvent<IndexedMedicine>[] = [];
  let t = 1000;
  const pipeline = createScanPipeline({
    resolve: (normalized) => resolveScan(index, normalized),
    onEvent: (event) => events.push(event),
    now: () => t,
    maxRawLength,
  });
  return {
    events,
    advance: (ms) => {
      t += ms;
    },
    pipeline,
  };
}

function scanEvents(h: Harness): Extract<ScanEvent<IndexedMedicine>, { kind: "scan" }>[] {
  return h.events.filter((e) => e.kind === "scan") as Extract<
    ScanEvent<IndexedMedicine>,
    { kind: "scan" }
  >[];
}

function rejectedReasons(h: Harness): string[] {
  return h.events
    .filter((e) => e.kind === "rejected")
    .map((e) => (e.kind === "rejected" ? e.reason : ""));
}

// ---------------------------------------------------------------------------
// Source tagging — all five input methods converge on the pipeline
// ---------------------------------------------------------------------------

test("scanner: USB HID keyboard-wedge events are tagged 'hid'", () => {
  const h = makeHarness();
  // Firmware-speed keystrokes ending with Enter.
  const keys = Array.from({ length: 13 }, (_, i) => 1000 + i * 12);
  h.pipeline.submitInput("8901234567890", keys);
  const scans = scanEvents(h);
  assert.equal(scans.length, 1);
  assert.equal(scans[0].source, "hid");
  assert.equal(scans[0].normalized, "8901234567890");
});

test("scanner: Bluetooth HID keyboard-wedge (phone as BT keyboard) is 'hid' too", () => {
  // The browser cannot tell USB HID from Bluetooth HID — both arrive as
  // keystrokes — so they must share the "hid" tag rather than fake a split.
  assert.equal(classifyTypingSource(Array.from({ length: 10 }, (_, i) => 500 + i * 8), 600), "hid");
  const h = makeHarness();
  h.pipeline.submitInput("MED-ABC-123", Array.from({ length: 11 }, (_, i) => 1000 + i * 15));
  assert.equal(scanEvents(h)[0]?.source, "hid");
});

test("scanner: human typing is tagged 'manual'", () => {
  const h = makeHarness();
  const slowKeys = [1000, 1450, 1900, 2300, 2800, 3200];
  h.pipeline.submitInput("MED-ABC-123", slowKeys);
  const scans = scanEvents(h);
  assert.equal(scans.length, 1);
  assert.equal(scans[0].source, "manual");
});

test("scanner: fewer than four keys is never a scanner burst", () => {
  assert.equal(classifyTypingSource([1000, 1100], 1200), "manual");
});

test("scanner: camera detections are tagged 'camera'", () => {
  const h = makeHarness();
  h.pipeline.push("036000291450", "camera");
  const scans = scanEvents(h);
  assert.equal(scans.length, 1);
  assert.equal(scans[0].source, "camera");
  assert.equal(scans[0].resolution.status, "exact");
  assert.equal(scans[0].resolution.medicine?.id, "m3");
});

test("scanner: mobile companion GATT payloads are tagged 'mobile'", () => {
  const h = makeHarness();
  h.pipeline.push("8901 2345 6789 0", "mobile");
  const scans = scanEvents(h);
  assert.equal(scans.length, 1);
  assert.equal(scans[0].source, "mobile");
  assert.equal(scans[0].normalized, "8901 2345 6789 0");
});

// ---------------------------------------------------------------------------
// Normalization and terminators
// ---------------------------------------------------------------------------

test("scanner: control characters and terminators are stripped before lookup", () => {
  const h = makeHarness();
  h.pipeline.push("\u001d8901234567890\r\n", "hid");
  const scans = scanEvents(h);
  assert.equal(scans.length, 1);
  assert.equal(scans[0].normalized, "8901234567890");
  assert.equal(scans[0].resolution.status, "exact");
});

test("scanner: Enter-committed input is the terminator for HID buffers", () => {
  const h = makeHarness();
  // USB/BT scanners type the code then send Enter — submitInput is that commit.
  const fast = Array.from({ length: 12 }, (_, i) => 2000 + i * 10);
  h.pipeline.submitInput("036000291450", fast);
  h.advance(3000);
  h.pipeline.submitInput("MED-ABC-123", Array.from({ length: 11 }, (_, i) => 4000 + i * 10));
  const scans = scanEvents(h);
  assert.equal(scans.length, 2);
  assert.deepEqual(scans.map((s) => s.source), ["hid", "hid"]);
});

// ---------------------------------------------------------------------------
// Validation — malformed / oversized / empty payloads never reach the POS
// ---------------------------------------------------------------------------

test("scanner: malformed control-byte payloads are rejected", () => {
  const h = makeHarness();
  h.pipeline.push("\u0001BADCODE", "hid");
  h.pipeline.push("A\u0090B", "mobile");
  h.pipeline.push("8901234567890", "camera");
  assert.ok(rejectedReasons(h).every((r) => r === "malformed"));
  assert.equal(scanEvents(h).length, 1); // only the clean scan passed
});

test("scanner: oversized payloads are rejected", () => {
  const h = makeHarness(128);
  h.pipeline.push("X".repeat(129), "mobile");
  h.pipeline.push("8901234567890", "mobile");
  assert.deepEqual(rejectedReasons(h), ["too-long"]);
  assert.equal(scanEvents(h).length, 1);
});

test("scanner: empty payloads are rejected", () => {
  const h = makeHarness();
  h.pipeline.push("", "manual");
  h.pipeline.push("   ", "hid");
  h.pipeline.push("\u0000\u0000", "mobile");
  assert.equal(scanEvents(h).length, 0);
  assert.equal(h.events.length, 3);
});

// ---------------------------------------------------------------------------
// Rapid double-fire and repeated-scan semantics
// ---------------------------------------------------------------------------

test("scanner: identical double-fire within the rapid window is dropped", () => {
  const h = makeHarness();
  h.pipeline.push("8901234567890", "camera"); // t=1000
  h.pipeline.push("8901234567890", "camera"); // t=1000 (same frame burst)
  assert.equal(scanEvents(h).length, 1);
  assert.deepEqual(rejectedReasons(h), ["rapid"]);
});

test("scanner: same code inside the dedupe window is dropped once", () => {
  const h = makeHarness();
  h.pipeline.push("8901234567890", "camera"); // t=1000
  h.advance(400); // 400ms — past rapid (300ms), inside dedupe (600ms)
  h.pipeline.push("8901234567890", "camera");
  assert.equal(scanEvents(h).length, 1);
  assert.deepEqual(rejectedReasons(h), ["dedupe"]);
});

test("scanner: a genuine repeated scan (outside windows) still passes — qty increments", () => {
  const h = makeHarness();
  h.pipeline.push("8901234567890", "hid"); // t=1000
  h.advance(1000); // 1s later — cashier rescan
  h.pipeline.push("8901234567890", "hid");
  const scans = scanEvents(h);
  assert.equal(scans.length, 2, "repeated scan must reach the POS to increment quantity");
});

test("scanner: unrelated rapid events are deduped but ordering is preserved", () => {
  const h = makeHarness();
  h.pipeline.push("8901234567890", "hid"); // t=1000
  h.pipeline.push("MED-ABC-123", "hid"); // t=1000 — too fast, dropped (parity w/ old debounce)
  h.advance(500);
  h.pipeline.push("036000291450", "hid"); // t=1500
  const scans = scanEvents(h);
  assert.deepEqual(scans.map((s) => s.normalized), ["8901234567890", "036000291450"]);
});

// ---------------------------------------------------------------------------
// Resolution routing — the pipeline never decides, resolveScan is the authority
// ---------------------------------------------------------------------------

test("scanner: exact scans resolve to the medicine", () => {
  const h = makeHarness();
  h.pipeline.push("8901234567890", "hid");
  const res = scanEvents(h)[0]?.resolution;
  assert.equal(res?.status, "exact");
  assert.equal(res?.medicine?.id, "m1");
});

test("scanner: fuzzy scans resolve normally", () => {
  const h = makeHarness();
  h.pipeline.push("08901234567890", "hid"); // stray prefix digit
  const res = scanEvents(h)[0]?.resolution;
  assert.equal(res?.status, "fuzzy");
  assert.equal(res?.medicine?.id, "m1");
});

test("scanner: ambiguous scans are surfaced, never auto-picked", () => {
  const pair = buildMedicineIndex([
    { id: "a1", name: "Collide A", barcode: "A-B-C" },
    { id: "a2", name: "Collide B", barcode: "A-B-C" },
  ]);
  const events: ScanEvent<IndexedMedicine>[] = [];
  const pipeline = createScanPipeline<IndexedMedicine>({
    resolve: (n) => resolveScan(pair, n),
    onEvent: (e) => events.push(e),
    now: () => 1000,
  });
  pipeline.push("*A-B-C*", "hid");
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "scan");
  if (events[0].kind === "scan") {
    assert.equal(events[0].resolution.status, "ambiguous");
    assert.equal(events[0].resolution.medicine, null);
  }
});

test("scanner: unknown scans are surfaced with no medicine", () => {
  const h = makeHarness();
  h.pipeline.push("9999999999999", "manual");
  const res = scanEvents(h)[0]?.resolution;
  assert.equal(res?.status, "unknown");
  assert.equal(res?.medicine, null);
});

// ---------------------------------------------------------------------------
// Empty-scan regression — empty / whitespace input must never resolve a
// medicine or reach the cart (HMS POS Search icon + Enter reproduced bug).
// ---------------------------------------------------------------------------

test("regression: resolveScan can never resolve an empty normalized value", () => {
  for (const empty of ["", "   ", "\t\n", "\u0000\u0000", " \u001d "]) {
    const res = resolveScan(index, empty);
    assert.equal(res.status, "unknown", `resolveScan(${JSON.stringify(empty)})`);
    assert.equal(res.medicine, null);
    assert.equal(res.matchedKey, null);
  }
});

test("regression: findMedicineBySku never matches a blank SKU from empty input", () => {
  const list: IndexedMedicine[] = [
    { id: "blank1", name: "Phantom A", sku: "" },
    { id: "blank2", name: "Phantom B", sku: null },
    { id: "blank3", name: "Phantom C", sku: undefined },
    { id: "ok", name: "Real", sku: "MED-ABC-123" },
  ];
  // The reproduced bug: "" matched the first blank-SKU medicine.
  assert.equal(findMedicineBySku(list, ""), null);
  assert.equal(findMedicineBySku(list, "   "), null);
  assert.equal(findMedicineBySku(list, "\t\n"), null);
  // Valid non-empty input still resolves (case-insensitive, as before).
  assert.equal(findMedicineBySku(list, "MED-ABC-123")?.id, "ok");
  assert.equal(findMedicineBySku(list, "  med-abc-123  ")?.id, "ok");
  assert.equal(findMedicineBySku(list, "nope"), null);
});

test("regression: Enter on an empty scan field never emits a scan (cart unchanged)", () => {
  const h = makeHarness();
  // Enter with empty / whitespace-only / tabs-and-newlines value.
  h.pipeline.submitInput("", []);
  h.pipeline.submitInput("   ", []);
  h.pipeline.submitInput("\t\n", []);
  h.advance(500);
  h.pipeline.submitInput("", []);
  // The POS mutates the cart only on a "scan" event — zero scan events
  // means cart count, quantity, subtotal and grand total stay untouched.
  assert.equal(scanEvents(h).length, 0, "no scan event may reach the POS");
});

test("regression: repeated empty search-button clicks never add a medicine", () => {
  const h = makeHarness();
  for (let i = 0; i < 10; i++) {
    h.pipeline.push("", "manual"); // the HMS POS Search-icon button path
    h.advance(50);
  }
  assert.equal(scanEvents(h).length, 0);
  assert.equal(h.events.length, 10, "every submission is rejected");
  assert.ok(rejectedReasons(h).every((r) => r === "empty"));
});

test("regression: unknown non-empty barcode still surfaces (unknown flow runs)", () => {
  const h = makeHarness();
  h.pipeline.push("9999999999999", "hid");
  const scans = scanEvents(h);
  assert.equal(scans.length, 1);
  assert.equal(scans[0].resolution.status, "unknown");
  assert.equal(scans[0].resolution.medicine, null);
});

// ---------------------------------------------------------------------------
// Payload decoder (Web Bluetooth boundary — untrusted bytes)
// ---------------------------------------------------------------------------

test("bluetooth: decodeBarcodePayload accepts a clean payload", () => {
  const bytes = new TextEncoder().encode("8901234567890\n");
  assert.equal(decodeBarcodePayload(bytes), "8901234567890");
  assert.equal(decodeBarcodePayload(new DataView(bytes.buffer)), "8901234567890");
});

test("bluetooth: decodeBarcodePayload rejects empty, oversized and garbage bytes", () => {
  assert.equal(decodeBarcodePayload(null), null);
  assert.equal(decodeBarcodePayload(new Uint8Array(0)), null);
  assert.equal(decodeBarcodePayload(new Uint8Array(200)), null);
  assert.equal(decodeBarcodePayload(new TextEncoder().encode("\u0001\u0002\u0003")), null);
});

test("bluetooth: isWebBluetoothSupported feature-detects honestly", () => {
  assert.equal(isWebBluetoothSupported(undefined), false);
  assert.equal(isWebBluetoothSupported({}), false);
  assert.equal(isWebBluetoothSupported({ requestDevice: () => Promise.resolve() }), true);
});

// ---------------------------------------------------------------------------
// GATT transport — simulated adapter (SIMULATED TRANSPORT TESTED; real
// companion hardware still requires manual verification)
// ---------------------------------------------------------------------------

type SimulatedBluetooth = {
  requestDevice(options: { filters: { services: string[] }[] }): Promise<BluetoothDeviceLike>;
  emitPayload(text: string): void;
  simulateDisconnect(): void;
  emittedServices: string[];
};

function makeSimulatedBluetooth(): SimulatedBluetooth {
  let charListener: (() => void) | null = null;
  let disconnectListener: (() => void) | null = null;
  const emittedServices: string[] = [];
  const characteristic = {
    value: null as DataView | null,
    addEventListener(type: string, fn: () => void) {
      if (type === "characteristicvaluechanged") charListener = fn;
    },
    async startNotifications() {
      return characteristic;
    },
  };
  const server: BluetoothServerLike = {
    connected: true,
    async connect() {
      return server;
    },
    disconnect() {
      server.connected = false;
      disconnectListener?.();
    },
    async getPrimaryService(uuid: string) {
      emittedServices.push(uuid);
      return {
        async getCharacteristic(uuid: string) {
          emittedServices.push(uuid);
          return characteristic;
        },
      };
    },
  };
  const device: BluetoothDeviceLike = {
    name: "Sim Scanner",
    gatt: server,
    addEventListener(type: string, fn: () => void) {
      if (type === "gattserverdisconnected") disconnectListener = fn;
    },
    removeEventListener() {},
  };
  return {
    async requestDevice(options) {
      assert.ok(options.filters[0].services.length === 1, "must filter by the service UUID");
      return device;
    },
    emitPayload(text: string) {
      characteristic.value = new DataView(
        new TextEncoder().encode(text).buffer
      );
      charListener?.();
    },
    simulateDisconnect() {
      server.disconnect();
    },
    emittedServices,
  };
}

test("bluetooth: GATT transport connects, streams scans and survives disconnect", async () => {
  const bluetooth = makeSimulatedBluetooth();
  const scans: string[] = [];
  const statuses: string[] = [];
  const errors: string[] = [];
  const transport = new MobileScannerGattTransport(bluetooth, {
    onScan: (raw) => scans.push(raw),
    onStatus: (status) => statuses.push(status),
    onError: (message) => errors.push(message),
  });

  assert.equal(transport.getStatus(), "disconnected");
  assert.ok(isWebBluetoothSupported(bluetooth));

  await transport.connect();
  assert.equal(transport.getStatus(), "connected");
  assert.ok(statuses.includes("connecting"));
  assert.ok(statuses.includes("connected"));

  // A real notification payload → scan event, normalized at the boundary.
  bluetooth.emitPayload("8901234567890");
  bluetooth.emitPayload("\u001d036000291450\r");
  assert.deepEqual(scans, ["8901234567890", "036000291450"]);

  // Garbage payloads are dropped at the boundary, never forwarded.
  bluetooth.emitPayload("X".repeat(200));
  bluetooth.emitPayload("\u0001");
  assert.deepEqual(scans, ["8901234567890", "036000291450"]);
  assert.ok(errors.length >= 2, "invalid payloads must be reported");

  // The device dropping off the air is surfaced, and the link is reconnectable.
  bluetooth.simulateDisconnect();
  assert.equal(transport.getStatus(), "disconnected");
  await transport.connect();
  assert.equal(transport.getStatus(), "connected");
  bluetooth.emitPayload("MED-ABC-123");
  assert.deepEqual(scans, ["8901234567890", "036000291450", "MED-ABC-123"]);
});

test("bluetooth: transport is a no-op when Web Bluetooth is unavailable", () => {
  const statuses: string[] = [];
  const transport = new MobileScannerGattTransport(undefined, {
    onScan: () => {},
    onStatus: (status) => statuses.push(status),
    onError: () => {},
  });
  assert.equal(transport.getStatus(), "unsupported");
  void transport.connect(); // must not throw
  assert.deepEqual(statuses, ["unsupported"]);
});

test("bluetooth: connect failure reports error without breaking the pipeline", async () => {
  const failing = {
    async requestDevice() {
      throw new Error("no adapter");
    },
  };
  const statuses: string[] = [];
  const errors: string[] = [];
  const transport = new MobileScannerGattTransport(failing, {
    onScan: () => {},
    onStatus: (status) => statuses.push(status),
    onError: (message) => errors.push(message),
  });
  await transport.connect();
  assert.equal(transport.getStatus(), "error");
  assert.ok(errors[0].includes("no adapter"));
  // The pipeline itself keeps working with other sources after a BT failure.
  const h = makeHarness();
  h.pipeline.push("8901234567890", "hid");
  assert.equal(scanEvents(h).length, 1);
});
