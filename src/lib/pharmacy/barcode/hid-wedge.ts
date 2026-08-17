/**
 * Pharmacy Barcode — HID keyboard-wedge capture (pure, testable).
 *
 * Android Bluetooth HID scanner apps, USB scanners and physical Bluetooth
 * scanners all appear to the browser as a KEYBOARD. The browser cannot tell
 * them apart, and (critically) the POS must NOT care which Android app is
 * used: whatever sends "8901234567897" + Enter into Windows is a scanner.
 *
 * Two capture paths share this module:
 *
 *   1. The dedicated barcode input (the focused input IS the scanner) —
 *      Enter/NumpadEnter always commit it (Enter is the preferred
 *      terminator); Tab commits when configured; "none" auto-commits a
 *      scanner-speed burst after a short silence.
 *   2. A GLOBAL window keydown wedge — scanners keep working when focus is
 *      elsewhere (after payment selection, quantity buttons, dialogs). It
 *      NEVER captures keystrokes aimed at INPUT / TEXTAREA / SELECT /
 *      contenteditable (patient name, phone, search, discount, tender
 *      amounts — normal typing is untouched) and ONLY commits a burst that
 *      is typed at scanner speed (>= 4 keys, gaps < 80ms, inside an 800ms
 *      window, see classifyTypingSource in transport.ts). Human-speed
 *      keystrokes outside inputs are discarded, so normal keyboard use can
 *      never produce a scan.
 *
 * The suffix selector mirrors the Android app's own setting:
 *   "enter"  — scanner sends Enter / NumpadEnter
 *   "tab"    — scanner sends Tab (Enter still works too)
 *   "none"   — scanner sends nothing; the burst commits after silence
 *
 * No app-specific protocol, no UUID, no companion service, no Web
 * Bluetooth, no Wi-Fi, no cloud: a Bluetooth-HID phone scan is just
 * keystrokes, exactly like a USB scanner.
 */

import { classifyTypingSource } from "./transport";

export type HidSuffix = "enter" | "tab" | "none";

export const HID_SUFFIX_OPTIONS: readonly HidSuffix[] = ["enter", "tab", "none"];

export function isHidSuffix(value: unknown): value is HidSuffix {
  return value === "enter" || value === "tab" || value === "none";
}

/**
 * Is this key the configured scanner terminator? Enter / NumpadEnter ALWAYS
 * terminate (the requirement makes Enter the preferred terminator); Tab only
 * when the suffix is configured as "tab"; "none" relies on silence, but a
 * stray Enter still commits the burst immediately.
 */
export function isTerminatorKey(key: string, suffix: HidSuffix): boolean {
  if (key === "Enter" || key === "NumpadEnter") return true;
  return suffix === "tab" && key === "Tab";
}

/**
 * True when a keydown target is a normal text-entry element. The global
 * wedge skips these entirely — typing into patient name, phone, search,
 * quantity, discount, tender amounts etc. must behave exactly like a
 * keyboard with no scanner present. Testable with plain objects (no DOM).
 */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  // Real INPUT/TEXTAREA/SELECT nodes expose isContentEditable === false.
  // Check the tag first or the global wedge will treat focused form
  // fields as scanner input.
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable === true;
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"]);

export type HidKeyModifiers = {
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
};

export type HidWedgeCommit = {
  /** The full buffered burst — a complete barcode, never a partial prefix. */
  text: string;
  /** Keystroke timestamps of the burst, in order (for source tagging). */
  keyTimes: number[];
  at: number;
};

export type WedgeHandleResult =
  | "buffer"
  | "waiting"
  | "commit"
  | "discard"
  | "ignore";

export type WedgeTickResult = "commit" | "discard" | "waiting" | "idle";

export type HidWedgeOptions = {
  suffix: HidSuffix;
  onCommit: (commit: HidWedgeCommit) => void;
  /** Scanner-speed thresholds — defaults match the transport's. */
  hidGapMs?: number;
  hidBurstMs?: number;
  /** Silence that ends a "none"-suffix burst. */
  endDelayMs?: number;
  /** Buffer ceiling — anything larger is not a barcode. */
  maxLength?: number;
  /** Injectable clock (tests). */
  now?: () => number;
};

const DEFAULT_HID_GAP_MS = 80;
const DEFAULT_HID_BURST_MS = 800;
export const DEFAULT_NONE_SUFFIX_END_DELAY_MS = 150;
const DEFAULT_MAX_LENGTH = 128;

/**
 * Keystroke buffer for global wedge capture. Emits ONLY complete bursts:
 * printable characters are accumulated and committed when the configured
 * terminator arrives (or, for "none", when the burst goes silent) AND the
 * burst was typed at scanner speed. Any other key (Backspace, arrows,
 * Escape, a modifier chord, …) resets the buffer — a partial barcode is
 * never emitted.
 */
export class HidWedgeBuffer {
  private chars: string[] = [];
  private times: number[] = [];
  private readonly suffix: HidSuffix;
  private readonly onCommit: (commit: HidWedgeCommit) => void;
  private readonly hidGapMs: number;
  private readonly hidBurstMs: number;
  private readonly endDelayMs: number;
  private readonly maxLength: number;
  private readonly now: () => number;

  constructor(options: HidWedgeOptions) {
    this.suffix = options.suffix;
    this.onCommit = options.onCommit;
    this.hidGapMs = options.hidGapMs ?? DEFAULT_HID_GAP_MS;
    this.hidBurstMs = options.hidBurstMs ?? DEFAULT_HID_BURST_MS;
    this.endDelayMs = options.endDelayMs ?? DEFAULT_NONE_SUFFIX_END_DELAY_MS;
    this.maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
    this.now = options.now ?? (() => Date.now());
  }

  /** The text buffered so far ('' after a commit). */
  get text(): string {
    return this.chars.join("");
  }

  /** Keystroke timestamps of the current burst, in order. */
  get keyTimes(): number[] {
    return [...this.times];
  }

  get pending(): boolean {
    return this.chars.length > 0;
  }

  /** Drop any in-flight burst without emitting (focus changes, etc.). */
  clear(): void {
    this.chars = [];
    this.times = [];
  }

  /**
   * Feed one keydown. Returns what happened so the caller can prevent the
   * browser default ONLY on "commit" (e.g. stop a focused button from being
   * clicked by the scanner's Enter, or Tab moving focus).
   */
  handleKey(key: string, mods: HidKeyModifiers = {}): WedgeHandleResult {
    const at = this.now();
    if (mods.ctrl || mods.alt || mods.meta) {
      this.clear();
      return "discard";
    }
    if (MODIFIER_KEYS.has(key)) return "ignore";
    if (isTerminatorKey(key, this.suffix)) return this.commitOrDiscard(at);
    if (key.length === 1) {
      this.chars.push(key);
      this.times.push(at);
      if (this.chars.length > this.maxLength) {
        this.clear();
        return "discard";
      }
      // With "none" the caller schedules a silence tick after every key.
      return this.suffix === "none" ? "waiting" : "buffer";
    }
    this.clear();
    return "discard";
  }

  /**
   * Silence-driven commit for the "none" suffix: call with the current time
   * after a delay; commits only once the burst has been quiet long enough.
   */
  tick(at: number): WedgeTickResult {
    if (this.suffix !== "none") return "idle";
    if (!this.pending) return "idle";
    const last = this.times[this.times.length - 1];
    if (at - last < this.endDelayMs) return "waiting";
    return this.commitOrDiscard(at);
  }

  private commitOrDiscard(at: number): "commit" | "discard" {
    const text = this.text;
    if (!text || this.times.length === 0) {
      this.clear();
      return "discard";
    }
    if (
      classifyTypingSource(this.times, at, {
        hidGapMs: this.hidGapMs,
        hidBurstMs: this.hidBurstMs,
      }) === "hid"
    ) {
      this.onCommit({ text, keyTimes: [...this.times], at });
      this.clear();
      return "commit";
    }
    this.clear();
    return "discard";
  }
}
