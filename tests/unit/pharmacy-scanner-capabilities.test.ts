/**
 * PHARMACY POS — scanner capability + friendly UX regression tests.
 *
 * Guards the "scanner must remain fully functional" contract:
 *
 *   18. An ordinary paired phone (no BLE scanner service) gives the friendly
 *       "service not detected" copy — never GATT/UUID jargon.
 *   19. Scanner capability initial state is hydration-safe (always
 *       "checking" on the first render; detection happens in an effect).
 *   20. Image with no barcode gives explicit feedback.
 *   8.  Every scanner source resolves the SAME canonical medicine id.
 *   13/14. Stock validation applies to every scanner source — an
 *       out-of-stock scan cannot bypass the rules.
 *   10.  Immediate rescan resolves a medicine created after the scan.
 *
 * The transport-level reconnect guarantees (bounded 1/5…5/5, cancel on
 * manual disconnect, exhaustion stop) are already pinned in
 * pharmacy-scanner-reconnect.test.ts; source tagging and the empty-scan
 * guards live in pharmacy-scanner.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADVANCED_PHONE_SCANNER_HINT,
  ADVANCED_PHONE_SCANNER_LABEL,
  CAMERA_UNSUPPORTED_MESSAGE,
  HID_SUFFIX_LABELS,
  IMAGE_NO_BARCODE_MESSAGE,
  PHONE_SCANNER_HELP_MESSAGE,
  PHONE_SCANNER_HID_HINT,
  PHONE_SCANNER_NOT_DETECTED_DETAIL,
  PHONE_SCANNER_NOT_DETECTED_TITLE,
  SCANNER_DISCONNECTED_LABEL,
  SCANNER_READY_LABEL,
  USB_BLUETOOTH_SCANNER_HINT,
  detectScannerCapability,
  initialScannerCapability,
  phoneScannerErrorText,
  reconnectLabel,
} from "../../src/lib/pharmacy/barcode/capabilities";
import {
  MobileScannerGattTransport,
  classifyBluetoothConnectError,
  type BluetoothCharacteristicLike,
  type BluetoothDeviceLike,
  type BluetoothServerLike,
} from "../../src/lib/pharmacy/barcode/bluetooth";
import {
  type IndexedMedicine,
  buildMedicineIndex,
  resolveScan,
} from "../../src/lib/pharmacy/barcode/scan";
import { createScanPipeline } from "../../src/lib/pharmacy/barcode/transport";
import { canAddToCart, type CatalogMed } from "../../src/lib/pharmacy/pos-catalog";

/** Catalog rows carry stock; the in-memory index preserves extra props. */
type StockIndexedMedicine = IndexedMedicine & { stock_qty?: number };

// ---------------------------------------------------------------------------
// 19. Hydration-safe capability detection
// ---------------------------------------------------------------------------

test("capabilities: the initial scanner state is always 'checking' (hydration-safe)", () => {
  // The first render (SSR + first client render) must be deterministic:
  // no navigator/window/BarcodeDetector/localStorage is read to produce it.
  assert.equal(initialScannerCapability(), "checking");
});

test("capabilities: real detection takes the browser object explicitly (effect-only)", () => {
  // Detectability is a PURE function of the injected navigator.bluetooth
  // object — the component never reaches into globals during render.
  assert.equal(detectScannerCapability(undefined), "unavailable");
  assert.equal(detectScannerCapability({}), "unavailable");
  assert.equal(
    detectScannerCapability({ requestDevice: () => Promise.resolve() }),
    "available"
  );
});

// ---------------------------------------------------------------------------
// 18. Ordinary paired phone → friendly "service not detected" copy
// ---------------------------------------------------------------------------

test("capabilities: an ordinary paired phone is NOT labeled a compatible scanner", () => {
  // The browser chooser finds nothing advertising the scanner service.
  assert.equal(classifyBluetoothConnectError(Object.assign(new Error("no devices"), { name: "NotFoundError" })), "not-found");
  assert.equal(phoneScannerErrorText("not-found"), null, "not-found → the friendly block, not a raw error");
  // The block must say exactly this to a pharmacist — no UUID/GATT terms.
  assert.equal(PHONE_SCANNER_NOT_DETECTED_TITLE, "Phone scanner service not detected.");
  assert.equal(
    PHONE_SCANNER_NOT_DETECTED_DETAIL,
    "Your phone is paired with Windows, but it is not currently sending barcode data as a scanner."
  );
  assert.equal(PHONE_SCANNER_HELP_MESSAGE, "Phone scanner: Use a Bluetooth barcode scanner app in Keyboard/HID mode.");
  // The BLE/GATT companion protocol is optional and clearly labeled — HID
  // mode never needs a Connect button.
  assert.equal(ADVANCED_PHONE_SCANNER_LABEL, "Advanced phone scanner connection");
  assert.equal(
    ADVANCED_PHONE_SCANNER_HINT,
    "Optional — only needed with the Bluetooth companion app."
  );
  assert.deepEqual(HID_SUFFIX_LABELS, { enter: "Enter", tab: "Tab", none: "None" });
});

test("capabilities: connect failures are classified without leaking raw browser text", () => {
  assert.equal(classifyBluetoothConnectError(Object.assign(new Error("x"), { name: "NotAllowedError" })), "canceled");
  assert.equal(classifyBluetoothConnectError(Object.assign(new Error("x"), { name: "AbortError" })), "canceled");
  assert.equal(
    classifyBluetoothConnectError(
      Object.assign(new Error("User cancelled the requestDevice() chooser."), { name: "NotFoundError" })
    ),
    "canceled",
    "chooser cancel must not be classified as not-found"
  );
  assert.notEqual(phoneScannerErrorText("canceled"), null);
  assert.notEqual(
    phoneScannerErrorText("canceled"),
    PHONE_SCANNER_NOT_DETECTED_TITLE,
    "cancel copy must not say service not detected"
  );
  assert.equal(classifyBluetoothConnectError(Object.assign(new Error("x"), { name: "SecurityError" })), "security");
  assert.equal(classifyBluetoothConnectError(Object.assign(new Error("x"), { name: "NotSupportedError" })), "adapter");
  assert.equal(classifyBluetoothConnectError(new Error("No Bluetooth adapter found")), "adapter");
  assert.equal(classifyBluetoothConnectError(new Error("gatt link down")), "unknown");
  assert.equal(phoneScannerErrorText("canceled"), "Connection cancelled.");
  assert.equal(phoneScannerErrorText("unknown"), "Could not connect to the phone scanner.");
});

test("capabilities: the transport reports the failure kind to the UI", async () => {
  const failing = {
    async requestDevice() {
      throw Object.assign(new Error("no device advertising f4d1b0c2"), { name: "NotFoundError" });
    },
  };
  const errors: Array<{ message: string; kind?: string }> = [];
  const transport = new MobileScannerGattTransport(failing, {
    onScan: () => {},
    onStatus: () => {},
    onError: (message, kind) => errors.push({ message, kind }),
  });
  await transport.connect();
  assert.equal(transport.getStatus(), "error");
  assert.equal(errors[0]?.kind, "not-found", "UI can show the friendly block");
});

test("capabilities: reconnect copy and exhaustion label stay plain language", () => {
  assert.equal(reconnectLabel(1, 5), "Reconnecting… 1/5");
  assert.equal(reconnectLabel(5, 5), "Reconnecting… 5/5");
  assert.equal(SCANNER_DISCONNECTED_LABEL, "Scanner disconnected");
});

// ---------------------------------------------------------------------------
// 20. Image with no barcode → explicit feedback; camera fallback copy
// ---------------------------------------------------------------------------

test("capabilities: no-barcode image feedback is explicit and camera fallback is honest", () => {
  assert.equal(IMAGE_NO_BARCODE_MESSAGE, "No barcode found in this image.");
  assert.equal(CAMERA_UNSUPPORTED_MESSAGE, "Camera scanning isn't supported in this browser.");
  // M6 Android HID: plain-language scanner status — no Connect button, no
  // app-specific protocol, no UUID.
  assert.equal(SCANNER_READY_LABEL, "Scanner ready");
  assert.equal(
    USB_BLUETOOTH_SCANNER_HINT,
    "USB / Bluetooth scanner: Pair your scanner or phone with this computer and scan normally."
  );
  assert.equal(
    PHONE_SCANNER_HID_HINT,
    "Phone scanner: Use a Bluetooth barcode scanner app in Keyboard/HID mode."
  );
});

// ---------------------------------------------------------------------------
// 8. Every scanner source resolves the SAME canonical medicine id
// ---------------------------------------------------------------------------

test("scanner: all four sources converge on the same canonical medicine", () => {
  const meds: IndexedMedicine[] = [
    { id: "canon-1", name: "M6 Scanner Test Medicine", barcode: "8901234567897" },
  ];
  const index = buildMedicineIndex(meds);
  const events: Array<{ source: string; id: string | null | undefined }> = [];
  let t = 1000;
  const pipeline = createScanPipeline<IndexedMedicine>({
    resolve: (n) => resolveScan(index, n),
    onEvent: (e) => {
      if (e.kind === "scan") events.push({ source: e.source, id: e.resolution.medicine?.id });
    },
    now: () => t,
  });
  pipeline.push("8901234567897", "hid");
  t += 1000;
  pipeline.push("8901234567897", "camera");
  t += 1000;
  pipeline.push("8901234567897", "manual");
  t += 1000;
  pipeline.push("8901234567897", "mobile");
  assert.equal(events.length, 4);
  assert.deepEqual(
    events.map((e) => e.source),
    ["hid", "camera", "manual", "mobile"]
  );
  assert.ok(
    events.every((e) => e.id === "canon-1"),
    "every source resolves the same medicine — no separate scanner medicine list"
  );
});

// ---------------------------------------------------------------------------
// 13/14. Stock validation applies to every scanner source
// ---------------------------------------------------------------------------

test("scanner: an out-of-stock medicine cannot be added regardless of source", () => {
  const meds: StockIndexedMedicine[] = [
    { id: "sold-out", name: "Sold Out Med", barcode: "8901234567897", stock_qty: 0 },
  ];
  const index = buildMedicineIndex(meds);
  const resolutions: Array<{ source: string; med: CatalogMed | null }> = [];
  let t = 1000;
  const pipeline = createScanPipeline<IndexedMedicine>({
    resolve: (n) => resolveScan(index, n),
    onEvent: (e) => {
      if (e.kind === "scan") {
        resolutions.push({ source: e.source, med: e.resolution.medicine as CatalogMed | null });
      }
    },
    now: () => t,
  });
  for (const source of ["hid", "camera", "manual", "mobile"] as const) {
    pipeline.push("8901234567897", source);
    t += 1000;
  }
  assert.equal(resolutions.length, 4, "all sources resolve the medicine");
  for (const { source, med } of resolutions) {
    assert.ok(med, `${source} resolved the medicine`);
    assert.equal(
      canAddToCart({ ...med, stock_qty: 0 }).ok,
      false,
      `${source}: out-of-stock scan cannot reach the cart`
    );
  }
});

// ---------------------------------------------------------------------------
// 10. Immediate rescan resolves a medicine created after the first scan
// ---------------------------------------------------------------------------

test("scanner: a medicine created after an unknown scan is resolvable on the next scan", () => {
  const before: IndexedMedicine[] = [{ id: "other", name: "Other Med", barcode: "1111111111111" }];
  let index = buildMedicineIndex(before);
  assert.equal(resolveScan(index, "8901234567897").status, "unknown");

  // Unknown barcode → SQLite medicine created → catalog refreshed → the POS
  // rebuilds the index (indexRef effect in BarcodeScanner) and the SAME code
  // now resolves — no page refresh needed.
  const after: StockIndexedMedicine[] = [
    ...before,
    { id: "created-1", name: "M6 Scanner Test Medicine", barcode: "8901234567897", stock_qty: 10 },
  ];
  index = buildMedicineIndex(after);
  const res = resolveScan(index, "8901234567897");
  assert.equal(res.status, "exact");
  assert.equal(res.medicine?.id, "created-1");
  const verdict = canAddToCart(res.medicine as CatalogMed);
  assert.equal(verdict.ok, true, "the freshly created medicine can be added to the cart");
});

// ---------------------------------------------------------------------------
// GATT transport still links scanner payloads to the canonical pipeline
// (companion mode: payload → pipeline → same resolution as every source)
// ---------------------------------------------------------------------------

test("scanner: a BLE companion payload resolves the same canonical medicine", async () => {
  const meds: IndexedMedicine[] = [
    { id: "ble-1", name: "BLE Med", barcode: "036000291450" },
  ];
  const index = buildMedicineIndex(meds);
  const characteristic: BluetoothCharacteristicLike & {
    _emit: () => void;
  } = {
    value: null as DataView | null,
    _emit: () => {},
    addEventListener(type: string, fn: () => void) {
      if (type === "characteristicvaluechanged") characteristic._emit = fn;
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
      characteristic._emit = () => {};
    },
    async getPrimaryService() {
      return {
        async getCharacteristic() {
          return characteristic;
        },
      };
    },
  };
  const device: BluetoothDeviceLike = {
    name: "Companion Scanner",
    gatt: server,
    addEventListener() {},
    removeEventListener() {},
  };
  const bluetooth = {
    async requestDevice() {
      return device;
    },
  };
  const ids: string[] = [];
  const transport = new MobileScannerGattTransport(bluetooth, {
    onScan: (raw) => ids.push(resolveScan(index, raw).medicine?.id ?? "none"),
    onStatus: () => {},
    onError: () => {},
  });
  await transport.connect();
  characteristic.value = new DataView(new TextEncoder().encode("036000291450").buffer);
  characteristic._emit();
  assert.deepEqual(ids, ["ble-1"], "companion payload → canonical pipeline → canonical id");
});
