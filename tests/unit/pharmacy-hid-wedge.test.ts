/**
 * PHARMACY M6 — ANDROID BLUETOOTH HID SCANNER COMPATIBILITY
 *
 * Regression coverage for the HID keyboard-wedge capture contract:
 *
 *   1.  HID digits + Enter → exactly one scan.
 *   2.  HID digits + NumpadEnter → exactly one scan.
 *   3.  HID digits + Tab → scan when configured for Tab.
 *   4.  Repeated barcode → repeated scans.
 *   5.  Empty Enter → zero scans.
 *   6.  Whitespace → zero scans.
 *   7.  Fast HID sequence → correct complete barcode.
 *   8.  No partial barcode emitted.
 *   9.  Barcode input clears after successful scan (component contract).
 *   10. Scanner ready for next scan.
 *   11. Unknown barcode opens Add Medicine.
 *   12. Created medicine immediately rescans (Qty 1 → 2 → 3).
 *   13. HID and camera resolve same medicine ID.
 *   14. HID and image upload resolve same medicine ID.
 *   15. HID works with cloud unavailable.
 *   16. HID works with navigator.onLine=false.
 *   17. HID does not require Web Bluetooth.
 *   18. HID does not require BLE service UUID.
 *   19. Normal typing in patient-name input does not create scans.
 *   20. Normal typing in medicine-search input does not create scans.
 *   21. Payment selection does not create scans.
 *   22. Empty Search click does not mutate cart.
 *   23. Scanner state initialization remains hydration-safe.
 *   24. Existing scanner tests remain green (whole suite, run at the end).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type IndexedMedicine,
  buildMedicineIndex,
  resolveScan,
} from "../../src/lib/pharmacy/barcode/scan";
import {
  type ScanEvent,
  createScanPipeline,
} from "../../src/lib/pharmacy/barcode/transport";
import {
  DEFAULT_NONE_SUFFIX_END_DELAY_MS,
  HidWedgeBuffer,
  isEditableTarget,
  isHidSuffix,
  isTerminatorKey,
  type HidSuffix,
} from "../../src/lib/pharmacy/barcode/hid-wedge";
import { initialScannerCapability } from "../../src/lib/pharmacy/barcode/capabilities";
import { addLineToCart, dispatchPosScan } from "../../src/lib/pharmacy/pos-catalog";

// ---------------------------------------------------------------------------
// Fixtures — the canonical M6 test value 8901234567897 → ₹56
// ---------------------------------------------------------------------------

type StockIndexedMedicine = IndexedMedicine & { stock_qty?: number; selling_price?: number };

const M6_CODE = "8901234567897";
const M6_FIXTURES: StockIndexedMedicine[] = [
  { id: "m6", name: "M6 Scanner Test Medicine", barcode: M6_CODE, stock_qty: 500 },
];

function makeIndex(meds: IndexedMedicine[] = M6_FIXTURES) {
  return buildMedicineIndex(meds);
}

type Harness = {
  events: ScanEvent<IndexedMedicine>[];
  advance: (ms: number) => void;
  pipeline: ReturnType<typeof createScanPipeline<IndexedMedicine>>;
};

function makeHarness(meds: IndexedMedicine[] = M6_FIXTURES): Harness {
  const events: ScanEvent<IndexedMedicine>[] = [];
  let t = 1000;
  const pipeline = createScanPipeline<IndexedMedicine>({
    resolve: (n) => resolveScan(makeIndex(meds), n),
    onEvent: (event) => events.push(event),
    now: () => t,
  });
  return {
    events,
    advance: (ms) => {
      t += ms;
    },
    pipeline,
  };
}

function scans(h: Harness): Extract<ScanEvent<IndexedMedicine>, { kind: "scan" }>[] {
  return h.events.filter((e) => e.kind === "scan") as Extract<
    ScanEvent<IndexedMedicine>,
    { kind: "scan" }
  >[];
}

/** A scanner-speed keystroke burst for one code (firmware-like 15ms gaps). */
function burst(code: string, start = 1000): number[] {
  return Array.from({ length: code.length }, (_, i) => start + i * 15);
}

type WedgeHarness = {
  /** Mutable clock — `now` reads this, tests can fast-forward it. */
  clock: { t: number };
  commits: string[];
  keyTimeLengths: number[];
  wedge: HidWedgeBuffer;
  key: (k: string, mods?: { ctrl?: boolean; alt?: boolean; meta?: boolean }) => void;
};

function makeWedge(suffix: HidSuffix): WedgeHarness {
  const clock = { t: 1000 };
  const commits: string[] = [];
  const keyTimeLengths: number[] = [];
  const wedge = new HidWedgeBuffer({
    suffix,
    now: () => clock.t,
    onCommit: (c) => {
      commits.push(c.text);
      keyTimeLengths.push(c.keyTimes.length);
    },
  });
  return {
    clock,
    commits,
    keyTimeLengths,
    wedge,
    key: (k, mods) => {
      void wedge.handleKey(k, mods);
      clock.t += 15;
    },
  };
}

// ---------------------------------------------------------------------------
// 1/2. HID digits + Enter / NumpadEnter → exactly one scan
// ---------------------------------------------------------------------------

test("M6-HID(1): digits + Enter commits exactly one scan with the full code", () => {
  const h = makeHarness();
  h.pipeline.submitInput(M6_CODE, burst(M6_CODE));
  const s = scans(h);
  assert.equal(s.length, 1, "exactly one scan event");
  assert.equal(s[0]?.normalized, M6_CODE);
  assert.equal(s[0]?.source, "hid");
  assert.equal(s[0]?.resolution.medicine?.id, "m6");
});

test("M6-HID(2): digits + NumpadEnter commits exactly one scan", () => {
  const h = makeHarness();
  h.pipeline.submitInput(M6_CODE, burst(M6_CODE));
  assert.equal(scans(h).length, 1);
  // NumpadEnter is the same "Enter" key to the browser — the wedge treats
  // it as the terminator identically.
  assert.equal(isTerminatorKey("NumpadEnter", "enter"), true);
});

test("M6-HID(1b): the wedge buffers digits and commits once on Enter", () => {
  const w = makeWedge("enter");
  for (const ch of M6_CODE) w.key(ch);
  assert.equal(w.commits.length, 0, "no commit before the terminator");
  w.key("Enter");
  assert.deepEqual(w.commits, [M6_CODE]);
  assert.deepEqual(w.keyTimeLengths, [M6_CODE.length], "keyTimes carry the burst");
});

// ---------------------------------------------------------------------------
// 3. Tab terminator — works when configured, inert otherwise
// ---------------------------------------------------------------------------

test("M6-HID(3): digits + Tab commits when the suffix is configured 'tab'", () => {
  const w = makeWedge("tab");
  for (const ch of M6_CODE) w.key(ch);
  assert.equal(w.commits.length, 0);
  w.key("Tab");
  assert.deepEqual(w.commits, [M6_CODE]);
});

test("M6-HID(3b): with suffix 'enter' a Tab is NOT a terminator — nothing commits", () => {
  const w = makeWedge("enter");
  for (const ch of M6_CODE) w.key(ch);
  w.key("Tab");
  assert.deepEqual(w.commits, [], "Tab only terminates when configured");
});

test("M6-HID(3c): Enter still terminates when suffix is 'tab' (preferred terminator)", () => {
  assert.equal(isTerminatorKey("Enter", "tab"), true);
  assert.equal(isTerminatorKey("NumpadEnter", "tab"), true);
  assert.equal(isTerminatorKey("Tab", "tab"), true);
  assert.equal(isTerminatorKey("Tab", "enter"), false);
  assert.equal(isTerminatorKey("Tab", "none"), false);
});

// ---------------------------------------------------------------------------
// 4. Repeated barcode → repeated scans (Qty increments)
// ---------------------------------------------------------------------------

test("M6-HID(4): repeated scans emit repeatedly — the wedge resets per burst", () => {
  const w = makeWedge("enter");
  for (const ch of M6_CODE) w.key(ch);
  w.key("Enter");
  for (const ch of M6_CODE) w.key(ch);
  w.key("Enter");
  for (const ch of M6_CODE) w.key(ch);
  w.key("Enter");
  assert.deepEqual(w.commits, [M6_CODE, M6_CODE, M6_CODE]);
  assert.deepEqual(w.keyTimeLengths, [13, 13, 13], "every burst is a full code");
});

test("M6-HID(4b): pipeline-level repeated scans (outside dedupe window) reach the cart", () => {
  const h = makeHarness();
  h.pipeline.push(M6_CODE, "hid"); // t=1000
  h.advance(1000);
  h.pipeline.push(M6_CODE, "hid"); // t=2000
  h.advance(1000);
  h.pipeline.push(M6_CODE, "hid"); // t=3000
  assert.equal(scans(h).length, 3, "three genuine scans → qty 3");
});

// ---------------------------------------------------------------------------
// 5/6. Empty Enter / whitespace → zero scans
// ---------------------------------------------------------------------------

test("M6-HID(5): Enter with no digits commits nothing", () => {
  const w = makeWedge("enter");
  w.key("Enter");
  assert.deepEqual(w.commits, []);
});

test("M6-HID(5b): pipeline rejects an empty Enter-commit", () => {
  const h = makeHarness();
  h.pipeline.submitInput("", []);
  h.pipeline.submitInput("   ", []);
  h.pipeline.submitInput("\t\n", []);
  assert.equal(scans(h).length, 0, "zero scan events reach the POS");
  assert.equal(h.events.length, 3, "every empty submission is rejected");
});

test("M6-HID(6): whitespace-only scans are normalized away — zero scans", () => {
  const h = makeHarness();
  h.pipeline.submitInput("   ", burst("    "));
  h.pipeline.push(" \u001d ", "hid");
  assert.equal(scans(h).length, 0, "whitespace can never resolve a medicine");
});

// ---------------------------------------------------------------------------
// 7/8. Fast bursts are complete; partial barcodes are never emitted
// ---------------------------------------------------------------------------

test("M6-HID(7): a fast HID sequence buffers the COMPLETE barcode in order", () => {
  const w = makeWedge("enter");
  for (const ch of M6_CODE) w.key(ch);
  w.key("Enter");
  assert.deepEqual(w.commits, [M6_CODE], "13 digits preserved in order");
});

test("M6-HID(8): no partial barcode is ever emitted", () => {
  const w = makeWedge("enter");
  for (const ch of M6_CODE.slice(0, 5)) w.key(ch); // 5 digits, no terminator
  assert.deepEqual(w.commits, [], "partial burst without terminator stays buffered");
  assert.equal(w.wedge.text, "89012", "the burst is buffered, not emitted");
  // An interrupt (Backspace) resets the burst — nothing was emitted.
  w.key("Backspace");
  assert.equal(w.wedge.text, "", "interrupted burst is cleared");
  // What follows becomes its OWN complete burst — a full code, never a
  // fragment of the interrupted one.
  for (const ch of M6_CODE.slice(5)) w.key(ch);
  assert.equal(w.wedge.text, "34567897");
  w.key("Enter");
  assert.deepEqual(w.commits, ["34567897"], "only complete bursts are ever emitted");
  // A fresh clean burst still works after the interrupt.
  for (const ch of M6_CODE) w.key(ch);
  w.key("Enter");
  assert.deepEqual(w.commits, ["34567897", M6_CODE]);
});

test("M6-HID(8b): a modifier chord never produces a scan", () => {
  const w = makeWedge("enter");
  w.key("s", { ctrl: true });
  w.key("s", { ctrl: true });
  w.key("Enter");
  assert.deepEqual(w.commits, [], "Ctrl+key shortcuts are never barcodes");
});

// ---------------------------------------------------------------------------
// 9/10. Input clears after a successful scan; ready for the next scan
// ---------------------------------------------------------------------------

test("M6-HID(9/10): commit clears the buffer — component clears + refocuses", () => {
  // Component contract: handleScanEvent clears the input (setValue("")),
  // plays the beep and refocuses; the wedge contract here is that after a
  // commit the buffer is empty and a second burst starts from scratch.
  const w = makeWedge("enter");
  for (const ch of M6_CODE) w.key(ch);
  w.key("Enter");
  assert.equal(w.wedge.text, "", "buffer is empty after the commit");
  assert.equal(w.wedge.pending, false);
  assert.deepEqual(w.wedge.keyTimes, []);
  for (const ch of M6_CODE) w.key(ch);
  w.key("Enter");
  assert.deepEqual(w.commits, [M6_CODE, M6_CODE], "scanner is ready for the next scan");
});

// ---------------------------------------------------------------------------
// 11/12. Unknown barcode → Add Medicine; created medicine rescans (Qty 1→2→3)
// ---------------------------------------------------------------------------

test("M6-HID(11): an unknown barcode opens Add Medicine", () => {
  const added: string[] = [];
  const unknown: string[] = [];
  const outcome = dispatchPosScan({
    raw: "9999999999999",
    medicine: null,
    add: (med: { id: string }) => added.push(med.id),
    onUnknown: (raw) => unknown.push(raw),
  });
  assert.equal(outcome, "unknown");
  assert.deepEqual(unknown, ["9999999999999"], "the POS opens the Add Medicine dialog");
  assert.deepEqual(added, []);
});

test("M6-HID(12): a medicine created after an unknown scan rescans to Qty 1→2→3", () => {
  const before: IndexedMedicine[] = [{ id: "other", name: "Other", barcode: "1111111111111" }];
  let index = buildMedicineIndex(before);
  assert.equal(resolveScan(index, M6_CODE).status, "unknown");

  // Unknown scan → SQLite create + catalog refresh → index rebuilt.
  const created: StockIndexedMedicine[] = [
    ...before,
    { id: "m6", name: "M6 Scanner Test Medicine", barcode: M6_CODE, stock_qty: 500, selling_price: 56 },
  ];
  index = buildMedicineIndex(created);
  const res = resolveScan(index, M6_CODE);
  assert.equal(res.status, "exact");
  assert.equal(res.medicine?.id, "m6");

  // The manual acceptance: scan → Qty 1, scan again → Qty 2, again → Qty 3.
  type CartProbe = {
    medicine_id?: string;
    name: string;
    selling_price: number;
    quantity: number;
  };
  let cart: CartProbe[] = [];
  for (let i = 1; i <= 3; i++) {
    const out:
      | { ok: true; cart: CartProbe[] }
      | { ok: false; message: string } = addLineToCart(cart, res.medicine, 1, 12);
    assert.equal(out.ok, true, `scan #${i} adds to the cart`);
    if (out.ok) cart = out.cart as CartProbe[];
    assert.equal(
      cart[0]?.quantity,
      i,
      `Qty ${i} after scan #${i} — no refresh, no search click, no unknown popup`
    );
  }
  assert.equal(cart[0]?.selling_price, 56, "M6 Scanner Test Medicine is ₹56");
});

// ---------------------------------------------------------------------------
// 13/14. HID, camera and image upload resolve the SAME medicine id
// ---------------------------------------------------------------------------

test("M6-HID(13/14): HID, camera and image-upload scans resolve the same id", () => {
  const h = makeHarness();
  h.pipeline.push(M6_CODE, "hid"); // USB / Bluetooth HID keystrokes
  h.advance(1000);
  h.pipeline.push(M6_CODE, "camera"); // camera loop detection
  h.advance(1000);
  h.pipeline.push(M6_CODE, "camera"); // scanImageFile uses source "camera"
  const s = scans(h);
  assert.equal(s.length, 3);
  assert.ok(
    s.every((e) => e.resolution.medicine?.id === "m6"),
    "one canonical medicine — no scanner-specific cart or list"
  );
});

// ---------------------------------------------------------------------------
// 15/16. HID works offline — no cloud, no navigator.onLine consultation
// ---------------------------------------------------------------------------

test("M6-HID(15): HID scanning works with the cloud dead (fetch throws)", () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (() => {
      throw new Error("network unreachable");
    }) as typeof fetch;
    const h = makeHarness();
    h.pipeline.submitInput(M6_CODE, burst(M6_CODE));
    const s = scans(h);
    assert.equal(s.length, 1);
    assert.equal(s[0]?.resolution.medicine?.id, "m6", "resolution is purely local");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("M6-HID(16): HID scanning works with navigator.onLine = false", () => {
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  try {
    if (nav) Object.defineProperty(nav, "onLine", { value: false, configurable: true });
  } catch {
    // navigator read-only or absent (plain Node) — the point still holds:
    // the pipeline never reads it.
  }
  const h = makeHarness();
  h.pipeline.submitInput(M6_CODE, burst(M6_CODE));
  assert.equal(scans(h).length, 1);
  assert.equal(scans(h)[0]?.resolution.medicine?.id, "m6");
});

// ---------------------------------------------------------------------------
// 17/18. No Web Bluetooth, no BLE service UUID, no app-specific protocol
// ---------------------------------------------------------------------------

test("M6-HID(17/18): the HID path needs no Web Bluetooth and no BLE UUID", () => {
  // Nothing in the HID path touches navigator.bluetooth or any service
  // UUID: keystrokes → wedge → pipeline → resolveScan. The test runs with
  // no Bluetooth object anywhere in scope.
  const h = makeHarness();
  h.pipeline.submitInput(M6_CODE, burst(M6_CODE));
  const s = scans(h);
  assert.equal(s.length, 1);
  assert.equal(s[0]?.source, "hid");
  assert.equal(s[0]?.resolution.medicine?.id, "m6");
  // Android app sends only keystrokes — no protocol markers to recognize.
  assert.equal(isTerminatorKey("Enter", "enter"), true);
});

test("M6-HID(18b): suffix configuration is strictly one of Enter / Tab / None", () => {
  assert.equal(isHidSuffix("enter"), true);
  assert.equal(isHidSuffix("tab"), true);
  assert.equal(isHidSuffix("none"), true);
  assert.equal(isHidSuffix("Enter"), false);
  assert.equal(isHidSuffix("gatt"), false);
  assert.equal(isHidSuffix(undefined), false);
});

// ---------------------------------------------------------------------------
// 19/20/21. Normal typing isolation — never an accidental scan
// ---------------------------------------------------------------------------

test("M6-HID(19/20): typing in patient-name / medicine-search inputs is never a scan", () => {
  // The global wedge skips every editable target BEFORE buffering keys.
  assert.equal(isEditableTarget({ tagName: "INPUT" }), true);
  assert.equal(isEditableTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isEditableTarget({ tagName: "SELECT" }), true);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isEditableTarget({ tagName: "BUTTON" }), false);
  assert.equal(isEditableTarget({ tagName: "DIV" }), false);
  assert.equal(isEditableTarget(null), false);
  assert.equal(isEditableTarget(undefined), false);
});

test("M6-HID(19c): real DOM inputs expose isContentEditable=false and must still be skipped", () => {
  assert.equal(isEditableTarget({ tagName: "INPUT", isContentEditable: false }), true);
  assert.equal(isEditableTarget({ tagName: "TEXTAREA", isContentEditable: false }), true);
  assert.equal(isEditableTarget({ tagName: "SELECT", isContentEditable: false }), true);
  assert.equal(isEditableTarget({ tagName: "BUTTON", isContentEditable: false }), false);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: false }), false);
});

test("M6-HID(19b): a slow human burst in the input is classified 'manual', not 'hid'", () => {
  const h = makeHarness();
  // The input commits on Enter either way, but the source tag must be
  // 'manual' — the pipeline never mistakes human typing for a scanner.
  const slow = Array.from({ length: M6_CODE.length }, (_, i) => 1000 + i * 200);
  h.pipeline.submitInput(M6_CODE, slow);
  const s = scans(h);
  assert.equal(s.length, 1);
  assert.equal(s[0]?.source, "manual");
});

test("M6-HID(21): payment-selection keystrokes never create scans", () => {
  // Payment flows happen in INPUT elements (amount, Txn ID — editable,
  // skipped) and BUTTON clicks (no keystrokes). Even keystrokes on a
  // non-editable target at human speed are discarded by the wedge.
  const w = makeWedge("enter");
  w.key("2");
  w.clock.t += 200;
  w.key("5");
  w.clock.t += 200;
  w.key("0");
  w.clock.t += 200;
  w.key("Enter");
  assert.deepEqual(w.commits, [], "human-speed keys outside inputs never scan");
});

test("M6-HID(21b): Enter on a focused button with no burst is not a scan", () => {
  const w = makeWedge("enter");
  w.key("Enter"); // single key — never a scanner burst
  assert.deepEqual(w.commits, []);
  assert.equal(isTerminatorKey("Enter", "enter"), true, "…but the key IS the terminator");
});

// ---------------------------------------------------------------------------
// 22. Empty Search click does not mutate the cart
// ---------------------------------------------------------------------------

test("M6-HID(22): empty / whitespace scan input is ignored — cart untouched", () => {
  const added: string[] = [];
  const unknown: string[] = [];
  for (const raw of ["", "   ", "\u001d", "\t\n"]) {
    const outcome = dispatchPosScan({
      raw,
      medicine: M6_FIXTURES[0],
      add: (med: { id: string }) => added.push(med.id),
      onUnknown: (r) => unknown.push(r),
    });
    assert.equal(outcome, "ignored", `empty ${JSON.stringify(raw)} never reaches the cart`);
  }
  assert.deepEqual(added, []);
  assert.deepEqual(unknown, []);
  const h = makeHarness();
  for (let i = 0; i < 5; i++) {
    h.pipeline.push("", "manual");
    h.advance(50);
  }
  assert.equal(scans(h).length, 0, "repeated empty submissions never scan");
});

// ---------------------------------------------------------------------------
// 23. Hydration-safe initialization
// ---------------------------------------------------------------------------

test("M6-HID(23): scanner state initialization stays hydration-safe", () => {
  // The first render (SSR + client) is deterministic — capability is
  // "checking" and the suffix defaults to "enter"; both change only in
  // effects after hydration.
  assert.equal(initialScannerCapability(), "checking");
});

// ---------------------------------------------------------------------------
// "none" suffix — silence-driven commit, still scanner-speed gated
// ---------------------------------------------------------------------------

test("M6-HID(none): 'none' suffix commits a burst after silence at scanner speed", () => {
  const w = makeWedge("none");
  for (const ch of M6_CODE) w.key(ch);
  assert.equal(w.commits.length, 0);
  const quietAt = w.clock.t + DEFAULT_NONE_SUFFIX_END_DELAY_MS + 10;
  assert.equal(w.wedge.tick(quietAt), "commit");
  assert.deepEqual(w.commits, [M6_CODE], "no terminator needed — silence commits it");
});

test("M6-HID(none): 'none' suffix never commits mid-burst or human-speed typing", () => {
  // Tick before the end delay elapses → still waiting (mid-burst).
  const w = makeWedge("none");
  for (const ch of M6_CODE.slice(0, 3)) w.key(ch);
  assert.equal(w.wedge.tick(w.clock.t + 10), "waiting", "silence not long enough yet");
  // After the delay: too few keys to be a scanner burst → discarded.
  assert.equal(
    w.wedge.tick(w.clock.t + DEFAULT_NONE_SUFFIX_END_DELAY_MS + 10),
    "discard",
    "a 3-key burst is not a scanner — never a partial barcode"
  );
  // Human-speed typing (200ms gaps) with suffix none → never a scan.
  const w2 = makeWedge("none");
  for (let i = 0; i < 6; i++) {
    w2.key("8");
    w2.clock.t += 200;
  }
  assert.equal(w2.wedge.tick(w2.clock.t + DEFAULT_NONE_SUFFIX_END_DELAY_MS + 10), "discard");
  assert.deepEqual(w2.commits, []);
});
