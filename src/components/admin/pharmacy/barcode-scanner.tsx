"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth, Camera, CameraOff, Image as ImageIcon, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  type BarcodeFormat,
  type IndexedMedicine,
  buildMedicineIndex,
  detectBarcodeFormat,
  isBarcodeLike,
  resolveScan,
} from "@/lib/pharmacy/barcode/scan";
import {
  type ScanEvent,
  type ScanPipeline,
  classifyTypingSource,
  createScanPipeline,
} from "@/lib/pharmacy/barcode/transport";
import {
  DEFAULT_NONE_SUFFIX_END_DELAY_MS,
  HidWedgeBuffer,
  isEditableTarget,
  isHidSuffix,
  isTerminatorKey,
  type HidSuffix,
} from "@/lib/pharmacy/barcode/hid-wedge";
import {
  type MobileScannerStatus,
  type BluetoothConnectFailure,
  MobileScannerGattTransport,
} from "@/lib/pharmacy/barcode/bluetooth";
import {
  ADVANCED_PHONE_SCANNER_HINT,
  ADVANCED_PHONE_SCANNER_LABEL,
  CAMERA_UNSUPPORTED_MESSAGE,
  CONNECT_PHONE_SCANNER_ACTION,
  DISCONNECT_ACTION,
  HID_SUFFIX_LABELS,
  IMAGE_NO_BARCODE_MESSAGE,
  PHONE_SCANNER_HELP_MESSAGE,
  PHONE_SCANNER_HID_HINT,
  PHONE_SCANNER_NOT_DETECTED_DETAIL,
  PHONE_SCANNER_NOT_DETECTED_TITLE,
  RECONNECT_ACTION,
  SCANNER_DISCONNECTED_LABEL,
  SCANNER_READY_LABEL,
  TRY_AGAIN_ACTION,
  USB_BLUETOOTH_SCANNER_HINT,
  detectScannerCapability,
  initialScannerCapability,
  phoneScannerErrorText,
  reconnectLabel,
  type PhoneScannerCapability,
} from "@/lib/pharmacy/barcode/capabilities";
import { playScanSound } from "@/lib/pharmacy/barcode/feedback";
import { formatLabel } from "@/lib/pharmacy/barcode/generate";

type BarcodeDetectorType = {
  detect(source: HTMLVideoElement | HTMLImageElement): Promise<Array<{ rawValue: string; format: string }>>;
};

type ScannerProps = {
  medicines: IndexedMedicine[];
  onScan: (raw: string, medicine: IndexedMedicine | null) => void;
  autoFocus?: boolean;
  continuous?: boolean;
  sound?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Bump to refocus the scanner input from outside (e.g. after the POS's
   * unknown-barcode dialog closes) — the next scan lands immediately.
   */
  focusSignal?: number;
};

const CAMERA_FORMATS: Record<string, BarcodeFormat> = {
  ean_13: "ean13",
  upc_a: "upc",
  code_128: "code128",
  code_39: "code39",
  qr_code: "qr",
};

const HID_SUFFIX_STORAGE_KEY = "pharmacy-pos-scanner-suffix";

export function BarcodeScanner({
  medicines,
  onScan,
  autoFocus = true,
  continuous = true,
  sound = true,
  placeholder = "Scan barcode / QR…",
  disabled = false,
  focusSignal = 0,
}: ScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectorRef = useRef<BarcodeDetectorType | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const keysRef = useRef<number[]>([]);
  const mobileTransportRef = useRef<MobileScannerGattTransport | null>(null);
  const [value, setValue] = useState("");
  const [flash, setFlash] = useState<"ok" | "error" | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraState, setCameraState] = useState<"idle" | "on" | "unsupported" | "denied">("idle");
  const [imageScanning, setImageScanning] = useState(false);
  const [lastDetected, setLastDetected] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  // Hydration-safe capability: the FIRST render is always "checking"
  // (deterministic on SSR + client); detection runs in an effect below.
  const [mobileCapability, setMobileCapability] = useState<PhoneScannerCapability>(
    initialScannerCapability()
  );
  const [mobileStatus, setMobileStatus] = useState<MobileScannerStatus>("disconnected");
  const [mobileDeviceName, setMobileDeviceName] = useState<string | null>(null);
  const [mobileReconnectAttempt, setMobileReconnectAttempt] = useState(0);
  const [mobileReconnectMax, setMobileReconnectMax] = useState(5);
  const [mobileRemembered, setMobileRemembered] = useState<string | null>(null);
  const [mobileErrorKind, setMobileErrorKind] = useState<BluetoothConnectFailure | null>(null);
  // Which terminator the scanner/Android app is configured to send. Default
  // Enter; Tab and None are selectable and persisted (loaded in an effect —
  // the first render always uses "enter", so hydration stays deterministic).
  const [suffix, setSuffix] = useState<HidSuffix>("enter");

  const indexRef = useRef(buildMedicineIndex(medicines));
  useEffect(() => {
    indexRef.current = buildMedicineIndex(medicines);
  }, [medicines]);

  // Mirror of the input value for the "none"-suffix silence commit.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Load the saved scanner suffix AFTER hydration (never during render).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(HID_SUFFIX_STORAGE_KEY);
      if (isHidSuffix(saved)) setSuffix(saved);
    } catch {
      /* storage unavailable — default Enter */
    }
  }, []);

  const changeSuffix = (next: HidSuffix) => {
    setSuffix(next);
    try {
      window.localStorage.setItem(HID_SUFFIX_STORAGE_KEY, next);
    } catch {
      /* persistence is best-effort */
    }
  };

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  const continuousRef = useRef(continuous);
  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);

  const refocus = () => {
    if (continuousRef.current && inputRef.current) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setCameraOn(false);
    setCameraState("idle");
  }, []);

  // All five input methods (USB/BT keyboard-wedge "hid", camera, manual,
  // mobile companion) converge on the pipeline; it validates + dedupes and
  // resolveScan stays the sole authority for exact/fuzzy/ambiguous/unknown.
  function handleScanEvent(event: ScanEvent<IndexedMedicine>) {
    if (event.kind === "rejected") {
      if (event.reason === "too-long") {
        setScanNotice("Scan rejected — code too long.");
      } else if (event.reason === "malformed") {
        setScanNotice("Scan rejected — malformed payload.");
      }
      // empty / rapid / dedupe are silent hardware double-fire protection.
      return;
    }
    const { normalized, resolution } = event;
    if (resolution.status === "ambiguous") {
      // Several medicines collapse to the same fuzzy code — never guess.
      setScanNotice("That code matches multiple medicines — pick one from search instead.");
      setFlash("error");
      playScanSound("error", soundRef.current);
      setLastDetected(normalized);
      setValue("");
      refocus();
      window.setTimeout(() => setFlash(null), 350);
      return;
    }
    onScanRef.current(normalized, resolution.medicine);
    setFlash(resolution.medicine ? "ok" : "error");
    playScanSound(resolution.medicine ? "ok" : "error", soundRef.current);
    setLastDetected(normalized);
    setValue("");
    refocus();
    // Non-continuous mode stops the camera after ONE successful scan and
    // returns to the input; continuous mode keeps detecting the next code.
    if (!continuousRef.current) stopCamera();
    window.setTimeout(() => setFlash(null), 350);
  }

  const pipelineRef = useRef<ScanPipeline | null>(null);

  // The pipeline is created once on mount and reads the fresh index (a ref,
  // kept current when `medicines` changes) on every scan — so a medicine
  // added after an unknown scan is resolvable without recreating it.
  useEffect(() => {
    const pipeline = createScanPipeline({
      resolve: (normalized) => resolveScan(indexRef.current, normalized),
      onEvent: handleScanEvent,
    });
    pipelineRef.current = pipeline;
    return () => {
      pipeline.reset();
      pipelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard-wedge: rapid keystrokes ending with the configured terminator
  // are scanner input (USB HID / Bluetooth HID / phone in Bluetooth-keyboard
  // mode). Enter / NumpadEnter ALWAYS commit (preferred terminator); Tab
  // commits when the suffix is configured as "tab"; "none" auto-commits a
  // scanner-speed burst after a short silence. Slow human typing stays in
  // the field until Enter — the input is barcode-dedicated, so this can
  // never interfere with patient/search/tender fields elsewhere.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.repeat) return;
    const at = Date.now();
    keysRef.current.push(at);
    keysRef.current = keysRef.current.filter((t) => at - t < 1000);
    if (isTerminatorKey(e.key, suffix)) {
      if (e.key === "Tab") {
        // Tab is the scanner terminator only when there is something to
        // scan; otherwise it navigates to the next field as usual.
        if (!value.trim()) return;
        e.preventDefault();
      } else {
        e.preventDefault();
      }
      pipelineRef.current?.submitInput(value, keysRef.current);
      keysRef.current = [];
      return;
    }
    // "none" suffix: the scanner sends no terminator — commit the burst
    // once it goes silent, but ONLY at scanner speed (never mid-thought).
    if (suffix === "none" && e.key.length === 1) {
      if (noneTimerRef.current != null) window.clearTimeout(noneTimerRef.current);
      noneTimerRef.current = window.setTimeout(() => {
        noneTimerRef.current = null;
        const text = valueRef.current;
        if (!text.trim()) return;
        if (classifyTypingSource(keysRef.current, Date.now()) !== "hid") return;
        pipelineRef.current?.submitInput(text, keysRef.current);
        keysRef.current = [];
      }, DEFAULT_NONE_SUFFIX_END_DELAY_MS);
    }
  };

  // GLOBAL wedge: scanners keep working even when focus is NOT on the
  // barcode input (after payment selection, quantity buttons, dialogs).
  // Editable elements (patient name, phone, search, discount, tender
  // amounts, Rx number…) are skipped entirely, so normal typing is never
  // interpreted as a scan; outside inputs only scanner-speed bursts commit.
  const wedgeRef = useRef<HidWedgeBuffer | null>(null);
  const noneTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const wedge = new HidWedgeBuffer({
      suffix,
      now: () => Date.now(),
      onCommit: ({ text, keyTimes }) => pipelineRef.current?.submitInput(text, keyTimes),
    });
    wedgeRef.current = wedge;
    let tickTimer: number | null = null;
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isEditableTarget(e.target)) return; // normal typing — never a scan
      const status = wedge.handleKey(e.key, {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        meta: e.metaKey,
      });
      if (status === "commit") {
        // The scanner's Enter/Tab must not also activate the focused
        // button (or move focus) — the scan IS the action.
        e.preventDefault();
      }
      if (status === "waiting" || status === "buffer") {
        if (tickTimer != null) window.clearTimeout(tickTimer);
        tickTimer = window.setTimeout(() => {
          tickTimer = null;
          wedge.tick(Date.now());
        }, DEFAULT_NONE_SUFFIX_END_DELAY_MS + 20);
      }
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      if (tickTimer != null) window.clearTimeout(tickTimer);
      wedge.clear();
      wedgeRef.current = null;
    };
  }, [suffix]);

  // External focus requests (POS unknown-barcode dialog closing, etc.).
  useEffect(() => {
    if (focusSignal > 0) refocus();
  }, [focusSignal]);

  // Camera scanning via native BarcodeDetector (Chrome/Android).
  // Fallback chain: live camera → image-file decode (BarcodeDetector on stills)
  // → keyboard/manual entry (auto-focused input).
  const getDetector = useCallback(() => {
    if (detectorRef.current) return detectorRef.current;
    const win = window as unknown as {
      BarcodeDetector?: { new (c?: { formats?: string[] }): BarcodeDetectorType };
    };
    if (typeof win.BarcodeDetector !== "function") return null;
    detectorRef.current = new win.BarcodeDetector({
      formats: Object.keys(CAMERA_FORMATS),
    });
    return detectorRef.current;
  }, []);

  const startCamera = useCallback(async () => {
    const detector = getDetector();
    if (!detector) {
      setCameraState("unsupported");
      inputRef.current?.focus();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("denied");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const loop = () => {
        if (!cameraOn && !streamRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          detector
            .detect(video)
            .then((codes) => {
              if (codes.length > 0) {
                pipelineRef.current?.push(codes[0].rawValue, "camera");
              }
            })
            .catch(() => {
              /* detection frame failed — keep scanning */
            });
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      setCameraOn(true);
      setCameraState("on");
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      // Camera denied/unavailable — fall back to image-file scan.
      setCameraState("denied");
      inputRef.current?.focus();
    }
  }, [cameraOn, getDetector]);

  const scanImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const detector = getDetector();
      if (!detector) {
        setCameraState("unsupported");
        inputRef.current?.focus();
        return;
      }
      setImageScanning(true);
      try {
        const url = URL.createObjectURL(file);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("image load failed"));
          img.src = url;
        });
        const codes = await detector.detect(img);
        URL.revokeObjectURL(url);
        if (codes.length > 0) {
          pipelineRef.current?.push(codes[0].rawValue, "camera");
          setScanNotice(null);
        } else {
          setScanNotice(IMAGE_NO_BARCODE_MESSAGE);
        }
      } catch {
        setScanNotice("Could not read the image — type the code manually.");
      } finally {
        setImageScanning(false);
        inputRef.current?.focus();
      }
    },
    [getDetector]
  );

  // Mobile companion (Web Bluetooth GATT, Chromium only). Capability is
  // detected ONLY here — after hydration — so the first render is
  // deterministic ("checking") and can never mismatch SSR. When the browser
  // cannot offer the scanner service (or the phone does not advertise it),
  // the UI shows the friendly "service not detected" block — Windows
  // pairing alone never implies a working scanner.
  useEffect(() => {
    const bluetooth = (navigator as Navigator & { bluetooth?: unknown }).bluetooth;
    const capability = detectScannerCapability(bluetooth);
    setMobileCapability(capability);
    if (capability !== "available") return;
    const transport = new MobileScannerGattTransport(bluetooth, {
      onScan: (raw) => pipelineRef.current?.push(raw, "mobile"),
      onStatus: (status, deviceName, attempt) => {
        setMobileStatus(status);
        if (status === "connected") {
          setMobileReconnectAttempt(0);
          setMobileDeviceName(deviceName ?? null);
          setMobileRemembered(transport.getRememberedScannerName());
        } else if (status === "disconnected" || status === "error") {
          setMobileDeviceName(null);
        }
        if (attempt !== undefined) setMobileReconnectAttempt(attempt);
      },
      onError: (message, kind) => {
        // Connect failures carry a kind → the UI picks the right friendly
        // wording ("service not detected" etc.). Payload problems carry no
        // kind and surface as an inline notice.
        if (kind) setMobileErrorKind(kind);
        else setScanNotice(message);
      },
    });
    mobileTransportRef.current = transport;
    setMobileStatus(transport.getStatus());
    setMobileReconnectMax(transport.getMaxReconnectAttempts());
    setMobileRemembered(transport.getRememberedScannerName());
    return () => {
      transport.disconnect();
      mobileTransportRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // When camera hardware is unusable, steer the user to the fallback paths.
  useEffect(() => {
    if (cameraState === "unsupported" || cameraState === "denied") {
      inputRef.current?.focus();
    }
  }, [cameraState]);

  const toggleMobileScanner = () => {
    const transport = mobileTransportRef.current;
    if (!transport) return;
    if (transport.getStatus() === "connected" || transport.getStatus() === "connecting") {
      transport.disconnect();
    } else {
      setMobileReconnectAttempt(0);
      setMobileErrorKind(null);
      setScanNotice(null);
      void transport.connect();
    }
  };

  // [Try Again]: re-check capability (post-hydration, effect-style) and, when
  // the service IS available, retry the connect. For an ordinary paired phone
  // this honestly re-shows "service not detected" — no fake compatibility.
  const retryPhoneScanner = () => {
    const bluetooth = (navigator as Navigator & { bluetooth?: unknown }).bluetooth;
    const capability = detectScannerCapability(bluetooth);
    setMobileCapability(capability);
    setMobileErrorKind(null);
    setScanNotice(null);
    if (capability === "available") {
      setMobileReconnectAttempt(0);
      void mobileTransportRef.current?.connect();
    }
  };

  const forgetMobileScanner = () => {
    mobileTransportRef.current?.forgetScanner();
    setMobileRemembered(null);
  };

  const cameraFallbackNote =
    cameraState === "unsupported"
      ? CAMERA_UNSUPPORTED_MESSAGE
      : cameraState === "denied"
        ? "Camera unavailable or permission denied — scan a photo instead, or type the code manually."
        : null;

  const isBarcode = isBarcodeLike(value);
  const detectedFormat: BarcodeFormat | null = value.trim() ? detectBarcodeFormat(value) : null;
  const mobileConnected = mobileStatus === "connected";
  const mobileConnecting = mobileStatus === "connecting";
  // Auto-reconnect exhausted (1/5 … 5/5) → "Scanner disconnected" + Reconnect.
  const mobileExhausted =
    mobileStatus === "disconnected" &&
    mobileReconnectAttempt >= mobileReconnectMax &&
    mobileReconnectAttempt > 0;
  // Ordinary paired phone / unsupported browser: the BLE scanner service is
  // simply not available — show the friendly block, never GATT jargon.
  const showServiceNotDetected =
    mobileCapability === "unavailable" ||
    (mobileStatus === "error" && mobileErrorKind === "not-found");
  const mobileErrorText = mobileErrorKind ? phoneScannerErrorText(mobileErrorKind) : null;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            autoFocus={autoFocus}
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className={cn(
              "pr-10 font-mono",
              flash === "ok" && "border-emerald-500 ring-2 ring-emerald-500/30",
              flash === "error" && "border-rose-500 ring-2 ring-rose-500/30"
            )}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
          />
          {flash && (
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 right-3 flex items-center",
                flash === "ok" ? "text-emerald-500" : "text-rose-500"
              )}
            >
              <ScanLine className="h-4 w-4" aria-hidden />
            </span>
          )}
        </div>
        <Button
          type="button"
          size="icon"
          variant={cameraOn ? "default" : "outline"}
          title="Camera barcode / QR scanner"
          onClick={() => (cameraOn ? stopCamera() : void startCamera())}
        >
          {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={imageScanning}
          title="Scan a barcode / QR from a photo (camera fallback)"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Scan barcode from photo"
          onChange={(e) => {
            void scanImageFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {/* Keyboard-wedge (USB HID / Bluetooth HID / Android Bluetooth HID
          scanner app) needs no Connect button — the focused input IS the
          scanner. It never requires Web Bluetooth, a UUID, a companion
          service or a cloud connection. */}
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <ScanLine className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
          {SCANNER_READY_LABEL}
        </p>
        <p className="text-xs text-muted-foreground">{USB_BLUETOOTH_SCANNER_HINT}</p>
        <p className="text-xs text-muted-foreground">{PHONE_SCANNER_HID_HINT}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Scanner suffix:</span>
          <select
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            value={suffix}
            onChange={(e) => changeSuffix(e.target.value as HidSuffix)}
            aria-label="Scanner suffix"
          >
            {(["enter", "tab", "none"] as const).map((s) => (
              <option key={s} value={s}>
                {HID_SUFFIX_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {imageScanning && (
        <p className="text-xs text-muted-foreground">Reading barcode from image…</p>
      )}

      {value.trim() && (
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="font-mono">
            {formatLabel(detectedFormat || "unknown")}
          </Badge>
          <span className="text-muted-foreground">
            {isBarcode ? "Press Enter or scan" : "Typing…"}
          </span>
        </div>
      )}

      {cameraOn && (
        <div className="relative overflow-hidden rounded-xl border">
          <video ref={videoRef} muted playsInline className="h-48 w-full bg-black object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-24 w-40 rounded-lg border-2 border-emerald-400/70" />
          </div>
          <button
            type="button"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
            onClick={stopCamera}
            aria-label="Close camera"
          >
            <X className="h-4 w-4" />
          </button>
          {lastDetected && (
            <div className="absolute bottom-2 left-2 max-w-[80%] truncate rounded bg-black/60 px-2 py-1 font-mono text-xs text-emerald-300">
              {lastDetected}
            </div>
          )}
        </div>
      )}

      {cameraFallbackNote && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          <span className="font-medium">Camera fallback:</span> {cameraFallbackNote}
        </p>
      )}

      {/* Advanced phone scanner connection: the BLE/GATT companion protocol
          ONLY. HID mode (USB / Bluetooth / Android keyboard apps) never
          needs this — it is clearly labeled optional. */}
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Bluetooth className="h-3 w-3" aria-hidden />
        {ADVANCED_PHONE_SCANNER_LABEL}
        <span className="font-normal">— {ADVANCED_PHONE_SCANNER_HINT}</span>
      </p>
      {mobileCapability === "checking" ? (
        <p className="text-xs text-muted-foreground">Checking scanner support…</p>
      ) : showServiceNotDetected ? (
        <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            {PHONE_SCANNER_NOT_DETECTED_TITLE}
          </p>
          <p className="text-muted-foreground">{PHONE_SCANNER_NOT_DETECTED_DETAIL}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={retryPhoneScanner}
            >
              {TRY_AGAIN_ACTION}
            </Button>
            <span className="text-muted-foreground">{PHONE_SCANNER_HELP_MESSAGE}</span>
          </div>
        </div>
      ) : mobileCapability === "available" ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2 py-0.5",
                mobileConnected
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : mobileStatus === "error"
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : "border-border text-muted-foreground"
              )}
              title="Phone camera → Bluetooth → this POS (Web Bluetooth companion app)"
            >
              <Bluetooth
                className={cn("h-3 w-3", mobileConnected && "text-emerald-500")}
                aria-hidden
              />
              {mobileConnected
                ? `Phone scanner connected${mobileDeviceName ? ` — ${mobileDeviceName}` : ""}`
                : mobileConnecting
                  ? mobileReconnectAttempt > 0
                    ? reconnectLabel(mobileReconnectAttempt, mobileReconnectMax)
                    : "Connecting…"
                  : mobileStatus === "error"
                    ? mobileErrorText ?? "Could not connect to the phone scanner"
                    : mobileExhausted
                      ? SCANNER_DISCONNECTED_LABEL
                      : "Phone scanner not connected"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={toggleMobileScanner}
            >
              {mobileConnecting || mobileConnected
                ? DISCONNECT_ACTION
                : mobileStatus === "error"
                  ? TRY_AGAIN_ACTION
                  : mobileExhausted
                    ? RECONNECT_ACTION
                    : mobileRemembered
                      ? `${RECONNECT_ACTION} ${mobileRemembered}`
                      : CONNECT_PHONE_SCANNER_ACTION}
            </Button>
            {(mobileRemembered || mobileConnected) && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={forgetMobileScanner}
              >
                Forget scanner
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Uses the camera on your phone (companion app). First time: tap{" "}
            <span className="font-medium">{CONNECT_PHONE_SCANNER_ACTION}</span> and pick your
            phone in the browser list. If the link drops briefly, the POS reconnects by itself
            a few times — after that, tap the button once more.
          </p>
        </div>
      ) : null}

      {scanNotice && <p className="text-xs text-rose-600 dark:text-rose-400">{scanNotice}</p>}
    </div>
  );
}
