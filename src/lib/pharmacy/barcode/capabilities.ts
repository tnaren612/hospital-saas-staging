/**
 * Pharmacy Barcode — phone-scanner capability + plain-language copy (pure).
 *
 * HYDRATION CONTRACT
 * ------------------
 * The FIRST render (SSR + first client render) is deterministic: the initial
 * capability is always "checking" and never touches navigator.bluetooth /
 * navigator.mediaDevices / BarcodeDetector / window / localStorage. Real
 * capability detection happens ONLY inside a useEffect after hydration, so
 * scanner support can never cause a hydration mismatch.
 *
 * PHONE-SCANNER TRUTH (Android / iPhone)
 * --------------------------------------
 * A phone paired with Windows at the OS level does NOT expose barcode data:
 *
 *   A. Android / iPhone in Bluetooth-keyboard mode → the phone types the
 *      code + Enter into the POS. The browser cannot see the HID device at
 *      all; this works through the keyboard-wedge path (hid-wedge.ts) with
 *      ZERO Web Bluetooth code on the PC and ZERO Android-app-specific
 *      protocol — whatever sends "8901234567897" + Enter is a scanner.
 *   B. A companion app exposing the MOBILE_SCANNER_SERVICE_UUID GATT service
 *      → Web Bluetooth transport (Chrome/Edge) can connect and stream codes.
 *      This is the ONLY path that needs "Connect Phone Scanner" — shown as
 *      the clearly optional "Advanced phone scanner connection".
 *   C. An ordinary phone merely paired with Windows → NOT a barcode scanner.
 *      No POS code should ever pretend otherwise.
 *
 * The UI must therefore say "service not detected" (never UUID/GATT jargon)
 * when the Web Bluetooth service is unavailable — Windows pairing is not a
 * substitute.
 */

import { isWebBluetoothSupported } from "./bluetooth";
import type { BluetoothConnectFailure } from "./bluetooth";
import type { HidSuffix } from "./hid-wedge";

/** Image upload decoded nothing — explicit feedback, never silent. */
export const IMAGE_NO_BARCODE_MESSAGE = "No barcode found in this image.";
/** Camera cannot run (no BarcodeDetector / no media API in this browser). */
export const CAMERA_UNSUPPORTED_MESSAGE = "Camera scanning isn't supported in this browser.";
/** Keyboard-wedge scanners need no Connect button — the input IS the scanner. */
export const SCANNER_READY_LABEL = "Scanner ready";
export const USB_BLUETOOTH_SCANNER_HINT =
  "USB / Bluetooth scanner: Pair your scanner or phone with this computer and scan normally.";
export const PHONE_SCANNER_HID_HINT =
  "Phone scanner: Use a Bluetooth barcode scanner app in Keyboard/HID mode.";
/** Which terminator the scanner app is configured to send (default Enter). */
export const HID_SUFFIX_LABELS: Record<HidSuffix, string> = {
  enter: "Enter",
  tab: "Tab",
  none: "None",
};
/** The BLE/GATT companion protocol is optional — never required for HID. */
export const ADVANCED_PHONE_SCANNER_LABEL = "Advanced phone scanner connection";
export const ADVANCED_PHONE_SCANNER_HINT =
  "Optional — only needed with the Bluetooth companion app.";
/** Phone scanner: the BLE companion service is not available. */
export const PHONE_SCANNER_NOT_DETECTED_TITLE = "Phone scanner service not detected.";
export const PHONE_SCANNER_NOT_DETECTED_DETAIL =
  "Your phone is paired with Windows, but it is not currently sending barcode data as a scanner.";
export const PHONE_SCANNER_HELP_MESSAGE = PHONE_SCANNER_HID_HINT;
/** After the bounded auto-reconnect (1/5 … 5/5) has been exhausted. */
export const SCANNER_DISCONNECTED_LABEL = "Scanner disconnected";
export const RECONNECT_ACTION = "Reconnect";
export const TRY_AGAIN_ACTION = "Try Again";
export const CONNECT_PHONE_SCANNER_ACTION = "Connect Phone Scanner";
export const DISCONNECT_ACTION = "Disconnect";

export type PhoneScannerCapability = "checking" | "available" | "unavailable";

/**
 * Deterministic initial capability for the very first render. Never reads
 * navigator/window — capabilities are detected in an effect after hydration.
 */
export function initialScannerCapability(): PhoneScannerCapability {
  return "checking";
}

/**
 * Real capability detection. MUST be called from a useEffect (post-hydration);
 * the browser object is passed in so the first render never touches globals.
 */
export function detectScannerCapability(
  bluetooth: unknown
): Exclude<PhoneScannerCapability, "checking"> {
  return isWebBluetoothSupported(bluetooth) ? "available" : "unavailable";
}

/** "Reconnecting… 1/5" … "Reconnecting… 5/5" during bounded auto-reconnect. */
export function reconnectLabel(attempt: number, max: number): string {
  return `Reconnecting… ${Math.max(1, attempt)}/${Math.max(1, max)}`;
}

/**
 * Plain-language error for a failed phone-scanner connect. Returns null for
 * "not-found": the UI then shows the "service not detected" block instead
 * (an ordinary paired phone is not a scanner — never imply it is). No UUID
 * or GATT terminology is ever shown to pharmacists.
 */
export function phoneScannerErrorText(kind: BluetoothConnectFailure): string | null {
  switch (kind) {
    case "not-found":
      return null;
    case "canceled":
      return "Connection cancelled.";
    case "security":
      return "The browser blocked the connection — enable Bluetooth permissions.";
    case "adapter":
      return "No Bluetooth adapter was found on this PC.";
    default:
      return "Could not connect to the phone scanner.";
  }
}
