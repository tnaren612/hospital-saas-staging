/**
 * Pharmacy Barcode — sound & visual feedback (client-only).
 * A short WebAudio beep for scan success / failure; no audio assets needed.
 */

export type ScanFeedbackKind = "ok" | "error";

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!("AudioContext" in window) && !("webkitAudioContext" in window)) return null;
  const Win = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  ctx = ctx || new (Win.AudioContext || Win.webkitAudioContext!)();
  return ctx;
}

/** Play a short feedback beep. Safe to call on every scan. */
export function playScanSound(kind: ScanFeedbackKind, enabled = true): void {
  if (!enabled) return;
  try {
    const ac = audioContext();
    if (!ac) return;
    if (ac.state === "suspended") void ac.resume();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "square";
    osc.frequency.value = kind === "ok" ? 1200 : 380;
    gain.gain.setValueAtTime(0.001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (kind === "ok" ? 0.12 : 0.25));
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + (kind === "ok" ? 0.14 : 0.28));
  } catch {
    /* audio is best-effort */
  }
}
