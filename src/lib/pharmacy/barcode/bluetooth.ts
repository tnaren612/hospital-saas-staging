/**
 * Pharmacy Barcode — mobile companion transport over Web Bluetooth GATT
 *
 * REALITY CHECK
 * -------------
 * - The browser cannot read Bluetooth-HID reports (the HID service is
 *   blocklisted in Web Bluetooth) and cannot enumerate paired BT keyboards.
 *   A phone acting as a Bluetooth keyboard therefore lands on the existing
 *   keyboard-wedge path ("hid" source in transport.ts) with zero PC-side code.
 * - Web Bluetooth itself is Chromium-only: Chrome/Edge on Windows 10 1703+
 *   and Android. Safari (macOS/iOS) and Firefox do not ship it. iOS needs a
 *   third-party browser (Bluefy/WebBLE) or the native companion app.
 *
 * COMPANION APP PROTOCOL (documented contract, no firmware in this repo)
 * ---------------------------------------------------------------------
 * The companion mobile app acts as a BLE GATT *peripheral*:
 *
 *   Service UUID        MOBILE_SCANNER_SERVICE_UUID
 *   └─ "barcode" notify characteristic (BARCODE_CHARACTERISTIC_UUID)
 *        Each notification payload is the UTF-8 bytes of exactly one
 *        decoded barcode (≤ 128 bytes). Payloads may repeat.
 *   └─ "status" read characteristic: "idle" | "scanning" | "error"
 *
 * No command channel is exposed: the companion never executes anything,
 * the POS never sends instructions — barcode data flows one way. Pairing is
 * explicit via the browser chooser (requestDevice), a trusted session only,
 * and the connection is dropped when the page closes.
 *
 * iOS/iPadOS and Firefox: `isSupported()` returns false and the UI falls
 * back to the keyboard-wedge method (phone in Bluetooth-keyboard mode) —
 * the pipeline still receives those scans, just not via GATT.
 *
 * TESTABILITY
 * -----------
 * The transport only touches `navigator.bluetooth` through the structural
 * `BluetoothLike` interfaces below, so tests can inject a simulated adapter
 * (see tests/unit/pharmacy-scanner.test.ts). No production path fakes
 * hardware: when the browser API or the device is absent, the transport
 * reports "unsupported"/"disconnected" and simply does nothing else.
 */

import { normalizeBarcode } from "./scan";

export const MOBILE_SCANNER_SERVICE_UUID = "f4d1b0c2-3a4e-4b5f-8c6d-9e0a1b2c3d4e";
export const MOBILE_SCANNER_BARCODE_CHARACTERISTIC_UUID = "f4d1b0c2-3a4e-4b5f-8c6d-9e0a1b2c3d4f";
export const MOBILE_SCANNER_STATUS_CHARACTERISTIC_UUID = "f4d1b0c2-3a4e-4b5f-8c6d-9e0a1b2c3d50";

export const MOBILE_SCANNER_MAX_PAYLOAD_BYTES = 128;

export type MobileScannerStatus =
  | "unsupported"
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/**
 * Why a phone-scanner connect failed. "not-found" is the ordinary-paired-phone
 * case: the browser found no device advertising the scanner service — the UI
 * must say "Phone scanner service not detected", never imply the phone works.
 */
export type BluetoothConnectFailure =
  | "not-found"
  | "canceled"
  | "security"
  | "adapter"
  | "unknown";

const CONNECT_FAILURE_MESSAGES: Record<
  Exclude<BluetoothConnectFailure, "unknown">,
  string
> = {
  "not-found": "No phone scanner service was found nearby.",
  canceled: "Bluetooth connection cancelled.",
  security: "Bluetooth permission was blocked.",
  adapter: "No Bluetooth adapter was found.",
};

/** Classify a requestDevice/connect failure (stable across browsers). */
export function classifyBluetoothConnectError(error: unknown): BluetoothConnectFailure {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? String(error.message ?? "") : String(error ?? "");
  if (name === "NotFoundError") {
    // Chrome uses NotFoundError both when nothing advertises the service
    // and when the user cancels the chooser.
    return /cancel/i.test(message) ? "canceled" : "not-found";
  }
  if (name === "NotAllowedError" || name === "AbortError") return "canceled";
  if (name === "SecurityError") return "security";
  if (name === "NotSupportedError") return "adapter";
  if (/bluetooth adapter/i.test(message)) return "adapter";
  return "unknown";
}

export type MobileScannerCallbacks = {
  onScan: (raw: string) => void;
  onStatus: (
    status: MobileScannerStatus,
    deviceName?: string,
    reconnectAttempt?: number
  ) => void;
  onError: (message: string, kind?: BluetoothConnectFailure) => void;
};

/** Transport options — all injectable for deterministic tests. */
export type MobileScannerTransportOptions = {
  /** Attempt to reattach after a transient GATT disconnect (default true). */
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseMs?: number;
  reconnectCapMs?: number;
  /**
   * Scheduler for the reconnect delay (defaults to setTimeout). Returns a
   * handle accepted by `cancel`.
   */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
  /** Where the remembered scanner name lives (defaults to localStorage). */
  memoryStorage?: ScannerMemoryStorage | null;
};

/** Minimal structural view of the Web Bluetooth objects we use (no DOM types). */
export type BluetoothCharacteristicLike = {
  value?: DataView | ArrayBuffer | null;
  addEventListener(type: "characteristicvaluechanged", listener: () => void): void;
  removeEventListener?(type: "characteristicvaluechanged", listener: () => void): void;
  startNotifications(): Promise<unknown>;
  readValue?(): Promise<DataView>;
};

export type BluetoothServiceLike = {
  getCharacteristic(uuid: string): Promise<BluetoothCharacteristicLike>;
};

export type BluetoothServerLike = {
  connected: boolean;
  connect(): Promise<BluetoothServerLike>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothServiceLike>;
};

export type BluetoothDeviceLike = {
  name?: string;
  gatt?: BluetoothServerLike;
  addEventListener(type: "gattserverdisconnected", listener: () => void): void;
  removeEventListener?(type: "gattserverdisconnected", listener: () => void): void;
};

export type BluetoothNavigatorLike = {
  requestDevice(options: { filters: { services: string[] }[] }): Promise<BluetoothDeviceLike>;
};

/**
 * Feature-detect Web Bluetooth. Pass `navigator.bluetooth` (or a simulated
 * adapter in tests). Returns false on Safari, Firefox and any non-Bluetooth
 * environment — the UI must then fall back to keyboard-wedge scanning.
 */
export function isWebBluetoothSupported(bluetooth?: unknown): boolean {
  return Boolean(bluetooth) && typeof (bluetooth as BluetoothNavigatorLike).requestDevice === "function";
}

/**
 * Decode + validate one notification payload. Returns the normalized barcode
 * string, or null when the payload is empty, oversized or contains only
 * non-printable data. Never throws.
 */
export function decodeBarcodePayload(
  value: ArrayBuffer | DataView | Uint8Array | null | undefined,
  maxBytes: number = MOBILE_SCANNER_MAX_PAYLOAD_BYTES
): string | null {
  if (!value) return null;
  let bytes: Uint8Array;
  if (value instanceof Uint8Array) {
    bytes = value;
  } else if (value instanceof DataView) {
    bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  } else {
    bytes = new Uint8Array(value);
  }
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
  const normalized = normalizeBarcode(text);
  if (!normalized || normalized.length > maxBytes) return null;
  if (!/^[\x20-\x7E]+$/.test(normalized)) return null;
  return normalized;
}

/**
 * Scanner memory: remembers the last successfully paired scanner so the UI
 * can name it and offer an explicit Reconnect (the browser still requires a
 * user-gesture chooser after a reload — we never bypass that boundary).
 */
export type ScannerMemoryStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const SCANNER_NAME_KEY = "ssh-pharmacy:scanner:name";

function defaultMemoryStorage(): ScannerMemoryStorage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function createScannerMemory(
  storage?: ScannerMemoryStorage | null
): {
  remember(name: string): void;
  forget(): void;
  get(): string | null;
} {
  const store = storage ?? defaultMemoryStorage();
  return {
    remember(name) {
      if (!store) return;
      try {
        store.setItem(SCANNER_NAME_KEY, name);
      } catch {
        // memory unavailable — connection still works this session
      }
    },
    forget() {
      if (!store) return;
      try {
        store.removeItem(SCANNER_NAME_KEY);
      } catch {
        // ignore
      }
    },
    get() {
      if (!store) return null;
      try {
        return store.getItem(SCANNER_NAME_KEY);
      } catch {
        return null;
      }
    },
  };
}

/**
 * GATT client transport for the mobile companion scanner.
 *
 * Lifecycle: connect() → browser chooser (explicit pairing) → GATT connect →
 * subscribe to the barcode notify characteristic → onScan(raw) per payload.
 * Disconnects (device move / timeout) are surfaced via onStatus and the
 * transport reconnects with bounded exponential backoff where the platform
 * permits (same-session reconnect needs no chooser); a failed link never
 * affects other methods. After a page reload a fresh user-gesture chooser is
 * required — the UI says "Reconnect" instead of pretending otherwise.
 */
export class MobileScannerGattTransport {
  private readonly callbacks: MobileScannerCallbacks;
  private readonly opts: Required<Pick<MobileScannerTransportOptions,
    "autoReconnect" | "maxReconnectAttempts" | "reconnectBaseMs" | "reconnectCapMs">> &
    Pick<MobileScannerTransportOptions, "schedule" | "cancel">;
  private device: BluetoothDeviceLike | null = null;
  private characteristic: BluetoothCharacteristicLike | null = null;
  private status: MobileScannerStatus = "unsupported";
  private reported = false;
  private reconnectAttempts = 0;
  private reconnectTimer: unknown = null;
  private memory = createScannerMemory();  private readonly onCharChange = () => {
    const value = this.characteristic?.value;
    const raw = decodeBarcodePayload(value);
    if (raw != null) {
      this.callbacks.onScan(raw);
    } else {
      this.callbacks.onError("Ignored an invalid payload from the mobile scanner.");
    }
  };
  private readonly onDisconnected = () => {
    this.characteristic = null;
    if (!this.opts.autoReconnect || !this.device) {
      this.device = null;
      this.setStatus("disconnected");
      return;
    }
    // Transient GATT drop: keep the device object (same-session reconnects
    // are allowed by the platform without a new chooser) and back off.
    this.setStatus("disconnected");
    this.scheduleReconnect();
  };

  constructor(
    bluetooth: unknown,
    callbacks: MobileScannerCallbacks,
    opts: MobileScannerTransportOptions = {}
  ) {
    this.callbacks = callbacks;
    this.opts = {
      autoReconnect: opts.autoReconnect !== false,
      maxReconnectAttempts: opts.maxReconnectAttempts ?? 5,
      reconnectBaseMs: opts.reconnectBaseMs ?? 1000,
      reconnectCapMs: opts.reconnectCapMs ?? 16000,
      schedule: opts.schedule,
      cancel: opts.cancel,
    };
    if (opts.memoryStorage !== undefined) {
      this.memory = createScannerMemory(opts.memoryStorage);
    }
    if (!isWebBluetoothSupported(bluetooth)) {
      this.setStatus("unsupported");
      return;
    }
    this.bluetooth = bluetooth as BluetoothNavigatorLike;
    this.setStatus("disconnected");
  }

  private bluetooth!: BluetoothNavigatorLike;

  getStatus(): MobileScannerStatus {
    return this.status;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  getMaxReconnectAttempts(): number {
    return this.opts.maxReconnectAttempts;
  }

  getRememberedScannerName(): string | null {
    return this.memory.get();
  }

  forgetScanner(): void {
    this.memory.forget();
  }

  async connect(): Promise<void> {
    this.cancelReconnect();
    this.reconnectAttempts = 0;
    if (!this.bluetooth) {
      this.setStatus("unsupported");
      return;
    }
    if (this.status === "connecting" || this.status === "connected") return;
    this.setStatus("connecting");
    try {
      const device = await this.bluetooth.requestDevice({
        filters: [{ services: [MOBILE_SCANNER_SERVICE_UUID] }],
      });
      this.device = device;
      device.addEventListener("gattserverdisconnected", this.onDisconnected);
      await this.attach(device);
    } catch (error) {
      this.device = null;
      this.setStatus("error");
      const kind = classifyBluetoothConnectError(error);
      const message =
        kind === "unknown"
          ? error instanceof Error
            ? error.message
            : "Could not connect to the mobile scanner."
          : CONNECT_FAILURE_MESSAGES[kind];
      this.callbacks.onError(message, kind);
    }
  }

  /** Reconnect to the SAME device object — no chooser, no user gesture. */
  private async reconnect(): Promise<void> {
    const device = this.device;
    if (!device) return;
    this.reconnectAttempts++;
    this.setStatus("connecting", undefined, this.reconnectAttempts);
    try {
      await this.attach(device);
    } catch {
      if (!this.device) return;
      this.scheduleReconnect();
    }
  }

  private async attach(device: BluetoothDeviceLike): Promise<void> {
    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(MOBILE_SCANNER_SERVICE_UUID);
    const characteristic = await service.getCharacteristic(
      MOBILE_SCANNER_BARCODE_CHARACTERISTIC_UUID
    );
    characteristic.addEventListener("characteristicvaluechanged", this.onCharChange);
    await characteristic.startNotifications();
    this.characteristic = characteristic;
    this.reconnectAttempts = 0;
    this.memory.remember(device.name || "Scanner");
    this.setStatus("connected", device.name);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer != null) return;
    if (this.reconnectAttempts >= this.opts.maxReconnectAttempts) {
      this.device = null;
      // Report the attempt count so the UI can say "Scanner disconnected"
      // (exhausted) instead of "not connected" (fresh) — and offer Reconnect.
      this.setStatus("disconnected", undefined, this.reconnectAttempts);
      return;
    }
    const delay = Math.min(
      this.opts.reconnectBaseMs * 2 ** this.reconnectAttempts,
      this.opts.reconnectCapMs
    );
    const schedule = this.opts.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    this.reconnectTimer = schedule(() => {
      this.reconnectTimer = null;
      void this.reconnect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer != null) {
      const cancel = this.opts.cancel ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
      cancel(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  disconnect(): void {
    this.cancelReconnect();
    this.reconnectAttempts = 0;
    this.characteristic = null;
    // Release the device BEFORE gatt.disconnect(): the browser fires
    // gattserverdisconnected synchronously, and onDisconnected must not
    // schedule a reconnect for a manual disconnect.
    const device = this.device;
    this.device = null;
    if (device) {
      device.removeEventListener?.("gattserverdisconnected", this.onDisconnected);
      device.gatt?.disconnect();
    }
    if (this.status !== "unsupported") this.setStatus("disconnected");
  }

  private setStatus(
    status: MobileScannerStatus,
    deviceName?: string,
    reconnectAttempt?: number
  ): void {
    if (
      this.reported &&
      this.status === status &&
      !deviceName &&
      reconnectAttempt === undefined
    ) {
      return;
    }
    this.reported = true;
    this.status = status;
    this.callbacks.onStatus(status, deviceName, reconnectAttempt);
  }
}
