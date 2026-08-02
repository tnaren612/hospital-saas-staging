/**
 * Pharmacy Barcode — scan transport pipeline (pure, testable)
 *
 * All five physical input methods converge here:
 *
 *   1. USB HID keyboard-wedge scanner   → keystrokes → "hid"
 *   2. Bluetooth HID scanner / phone in
 *      Bluetooth-keyboard mode          → keystrokes → "hid"
 *   3. On-device camera (BarcodeDetector) → full payload → "camera"
 *   4. Manual entry                     → Enter on the input → "manual"
 *   5. Mobile companion app over Web
 *      Bluetooth GATT (Chrome/Edge)     → notification → "mobile"
 *
 * The browser cannot distinguish USB HID from Bluetooth HID keyboard-wedge
 * input — both arrive as keystrokes — so they share the "hid" source tag.
 * A phone scanning via a Bluetooth-keyboard companion app is also "hid";
 * only the GATT companion (see bluetooth.ts) is tagged "mobile".
 *
 * The pipeline owns validation (empty / oversized / malformed), rapid
 * double-fire protection and same-code dedupe. It never resolves medicines
 * itself — the caller injects `resolve`, so the POS remains the sole
 * authority for exact/fuzzy/ambiguous/unknown decisions.
 */

import { normalizeBarcode } from "./scan";

export type ScanSource = "hid" | "camera" | "manual" | "mobile";

export type ScanRejectReason = "empty" | "too-long" | "malformed" | "rapid" | "dedupe";

export type ScanResolution<M> = {
  status: "exact" | "fuzzy" | "ambiguous" | "unknown";
  medicine: M | null;
  matchedKey: string | null;
};

export type ScanEvent<M> =
  | {
      kind: "scan";
      source: ScanSource;
      raw: string;
      normalized: string;
      resolution: ScanResolution<M>;
      at: number;
    }
  | { kind: "rejected"; source: ScanSource; raw: string; reason: ScanRejectReason; at: number };

export type ScanPipelineOptions<M> = {
  resolve: (normalized: string) => ScanResolution<M>;
  onEvent: (event: ScanEvent<M>) => void;
  /** Any scan arriving within this window of the previous one is dropped. */
  rapidWindowMs?: number;
  /** Identical normalized code within this window is dropped (scanner double-fire). */
  dedupeWindowMs?: number;
  /** Maximum accepted length after normalization. */
  maxRawLength?: number;
  /** Injectable clock (tests). */
  now?: () => number;
};

const DEFAULT_RAPID_WINDOW_MS = 300;
const DEFAULT_DEDUPE_WINDOW_MS = 600;
const DEFAULT_MAX_RAW_LENGTH = 128;

/**
 * Control bytes we reject outright instead of silently stripping: C0 controls
 * outside the scanner-terminator allowlist (CR/LF/TAB, GS/FS/RS group
 * separators, STX/ETX framing) plus C1 high bytes. A glitched or hostile
 * payload carrying such bytes is malformed — never a scan.
 */
const MALFORMED_CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1B\x1F\x80-\x9F]/;

export type ScanPipeline = {
  /** Submit a complete decoded payload (camera, mobile, Enter on input). */
  push(raw: string, source: ScanSource): void;
  /**
   * Submit an Enter-committed input value. The source is inferred from the
   * typing rhythm: fast bursts ending with Enter are keyboard-wedge scanners
   * ("hid"), anything slower is "manual".
   */
  submitInput(value: string, keyTimes: number[]): void;
  /** Drop any in-flight buffer state (not required for push-based use). */
  reset(): void;
};

/**
 * Infer whether an Enter-committed input was typed by a keyboard-wedge
 * scanner ("hid") or a human ("manual"). Scanner firmware types an entire
 * code in tens of milliseconds; human typing has gaps of 100ms+.
 */
export function classifyTypingSource(
  keyTimes: number[],
  now: number,
  opts?: { hidGapMs?: number; hidBurstMs?: number }
): ScanSource {
  const hidGapMs = opts?.hidGapMs ?? 80;
  const hidBurstMs = opts?.hidBurstMs ?? 800;
  const recent = keyTimes.filter((t) => now - t <= hidBurstMs);
  if (recent.length < 4) return "manual";
  recent.sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < recent.length; i++) {
    maxGap = Math.max(maxGap, recent[i] - recent[i - 1]);
  }
  return maxGap < hidGapMs ? "hid" : "manual";
}

export function createScanPipeline<M>(options: ScanPipelineOptions<M>): ScanPipeline {
  const rapidWindowMs = options.rapidWindowMs ?? DEFAULT_RAPID_WINDOW_MS;
  const dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const maxRawLength = options.maxRawLength ?? DEFAULT_MAX_RAW_LENGTH;
  const now = options.now ?? (() => Date.now());

  let lastScanAt = -Infinity;
  let lastNormalized = "";
  let lastNormalizedAt = -Infinity;

  const push = (raw: string, source: ScanSource) => {
    const at = now();
    const value = String(raw ?? "");
    const normalized = normalizeBarcode(value);

    if (!normalized) {
      options.onEvent({ kind: "rejected", source, raw: value, reason: "empty", at });
      return;
    }
    if (MALFORMED_CONTROL.test(value)) {
      options.onEvent({ kind: "rejected", source, raw: value, reason: "malformed", at });
      return;
    }
    if (normalized.length > maxRawLength) {
      options.onEvent({ kind: "rejected", source, raw: value, reason: "too-long", at });
      return;
    }
    if (at - lastScanAt < rapidWindowMs) {
      options.onEvent({ kind: "rejected", source, raw: value, reason: "rapid", at });
      return;
    }
    if (normalized === lastNormalized && at - lastNormalizedAt < dedupeWindowMs) {
      options.onEvent({ kind: "rejected", source, raw: value, reason: "dedupe", at });
      return;
    }

    lastScanAt = at;
    lastNormalized = normalized;
    lastNormalizedAt = at;

    options.onEvent({
      kind: "scan",
      source,
      raw: value,
      normalized,
      resolution: options.resolve(normalized),
      at,
    });
  };

  return {
    push,
    submitInput(value: string, keyTimes: number[]) {
      const source = classifyTypingSource(keyTimes, now());
      push(value, source);
    },
    reset() {
      lastScanAt = -Infinity;
      lastNormalized = "";
      lastNormalizedAt = -Infinity;
    },
  };
}
