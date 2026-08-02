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
  createScanPipeline,
} from "@/lib/pharmacy/barcode/transport";
import {
  type MobileScannerStatus,
  MobileScannerGattTransport,
  isWebBluetoothSupported,
} from "@/lib/pharmacy/barcode/bluetooth";
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
};

const CAMERA_FORMATS: Record<string, BarcodeFormat> = {
  ean_13: "ean13",
  upc_a: "upc",
  code_128: "code128",
  code_39: "code39",
  qr_code: "qr",
};

export function BarcodeScanner({
  medicines,
  onScan,
  autoFocus = true,
  continuous = true,
  sound = true,
  placeholder = "Scan barcode / QR…",
  disabled = false,
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
  const [mobileSupported, setMobileSupported] = useState(false);
  const [mobileStatus, setMobileStatus] = useState<MobileScannerStatus>("unsupported");
  const [mobileDeviceName, setMobileDeviceName] = useState<string | null>(null);
  const [mobileReconnectAttempt, setMobileReconnectAttempt] = useState(0);
  const [mobileReconnectMax, setMobileReconnectMax] = useState(5);
  const [mobileRemembered, setMobileRemembered] = useState<string | null>(null);

  const indexRef = useRef(buildMedicineIndex(medicines));
  useEffect(() => {
    indexRef.current = buildMedicineIndex(medicines);
  }, [medicines]);

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

  // Keyboard-wedge: rapid keystrokes ending with Enter are scanner input
  // (USB HID / Bluetooth HID / phone in Bluetooth-keyboard mode).
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    keysRef.current.push(Date.now());
    keysRef.current = keysRef.current.filter((t) => Date.now() - t < 1000);
    if (e.key === "Enter") {
      e.preventDefault();
      pipelineRef.current?.submitInput(value, keysRef.current);
      keysRef.current = [];
      return;
    }
  };

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
          setScanNotice("No barcode found in that image — try manual entry.");
        }
      } catch {
        setScanNotice("Could not read the image — type the code manually.");
      } finally {
        setImageScanning(false);
      }
    },
    [getDetector]
  );

  // Mobile companion (Web Bluetooth GATT, Chromium only): connect the phone
  // scanner, feed its payloads into the pipeline as the "mobile" source.
  // Status carries the device name and reconnect attempt so the UI can say
  // plain-language things ("Reconnecting… 2/5") without GATT/UUID jargon.
  useEffect(() => {
    const bluetooth = (navigator as Navigator & { bluetooth?: unknown }).bluetooth;
    if (!isWebBluetoothSupported(bluetooth)) {
      setMobileSupported(false);
      return;
    }
    setMobileSupported(true);
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
      onError: (message) => setScanNotice(message),
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
      void transport.connect();
    }
  };

  const forgetMobileScanner = () => {
    mobileTransportRef.current?.forgetScanner();
    setMobileRemembered(null);
  };

  const cameraFallbackNote =
    cameraState === "unsupported"
      ? "Camera scanning is not supported in this browser. USB / Bluetooth keyboard scanners work through the input; enter the code manually."
      : cameraState === "denied"
        ? "Camera unavailable or permission denied — scan a photo instead, or type the code manually."
        : null;

  const isBarcode = isBarcodeLike(value);
  const detectedFormat: BarcodeFormat | null = value.trim() ? detectBarcodeFormat(value) : null;
  const mobileConnected = mobileStatus === "connected";

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

      {mobileSupported ? (
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
              {mobileStatus === "connected"
                ? `Phone scanner connected${mobileDeviceName ? ` — ${mobileDeviceName}` : ""}`
                : mobileStatus === "connecting"
                  ? mobileReconnectAttempt > 0
                    ? `Reconnecting… (${mobileReconnectAttempt}/${mobileReconnectMax})`
                    : "Connecting…"
                  : mobileStatus === "error"
                    ? "Could not connect to the phone scanner"
                    : "Phone scanner not connected"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={mobileStatus === "unsupported"}
              onClick={toggleMobileScanner}
            >
              {mobileStatus === "connecting" || mobileStatus === "connected"
                ? "Disconnect"
                : mobileStatus === "error"
                  ? "Try Again"
                  : mobileRemembered
                    ? `Reconnect ${mobileRemembered}`
                    : "Connect Phone Scanner"}
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
            <span className="font-medium">Connect Phone Scanner</span> and pick your phone in
            the browser list. If the link drops briefly, the POS reconnects by itself a few
            times — after that, tap the button once more.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Mobile scanner over Bluetooth needs Chrome/Edge — the companion app in keyboard
          mode works in any browser through the input above.
        </p>
      )}

      {scanNotice && <p className="text-xs text-rose-600 dark:text-rose-400">{scanNotice}</p>}
    </div>
  );
}
