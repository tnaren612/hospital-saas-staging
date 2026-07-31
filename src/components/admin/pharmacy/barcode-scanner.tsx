"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine, X } from "lucide-react";
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
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanAtRef = useRef(0);
  const pendingRef = useRef(false);
  const [value, setValue] = useState("");
  const [flash, setFlash] = useState<"ok" | "error" | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraSupported, setCameraSupported] = useState<boolean | null>(null);
  const [lastDetected, setLastDetected] = useState<string | null>(null);

  const indexRef = useRef(buildMedicineIndex(medicines));
  useEffect(() => {
    indexRef.current = buildMedicineIndex(medicines);
  }, [medicines]);

  const commit = useCallback(
    (raw: string) => {
      const now = Date.now();
      if (now - lastScanAtRef.current < 350) return; // debounce double-scans
      lastScanAtRef.current = now;
      const value = raw.trim();
      if (!value) return;
      pendingRef.current = true;
      const { medicine } = resolveScan(indexRef.current, value);
      onScan(value, medicine);
      setFlash(medicine ? "ok" : "error");
      playScanSound(medicine ? "ok" : "error", sound);
      setLastDetected(value);
      setValue("");
      if (continuous && inputRef.current) {
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      window.setTimeout(() => setFlash(null), 350);
      window.setTimeout(() => {
        pendingRef.current = false;
      }, 400);
    },
    [continuous, onScan, sound]
  );

  // Keyboard-wedge: rapid keystrokes ending with Enter are scanner input.
  const keysRef = useRef<number[]>([]);
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(value);
      return;
    }
    keysRef.current.push(Date.now());
    keysRef.current = keysRef.current.filter((t) => Date.now() - t < 500);
  };

  // Camera scanning via native BarcodeDetector (Chrome/Android).
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    const win = window as unknown as { BarcodeDetector?: { new (c?: { formats?: string[] }): BarcodeDetectorType } };
    if (typeof win.BarcodeDetector !== "function") {
      setCameraSupported(false);
      return;
    }
    setCameraSupported(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new win.BarcodeDetector({
        formats: Object.keys(CAMERA_FORMATS),
      });
      const loop = async () => {
        if (!cameraOn && !streamRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0 && !pendingRef.current) {
              const first = codes[0];
              commit(first.rawValue);
            }
          } catch {
            /* detection frame failed — keep scanning */
          }
        }
        rafRef.current = requestAnimationFrame(() => void loop());
      };
      setCameraOn(true);
      rafRef.current = requestAnimationFrame(() => void loop());
    } catch {
      setCameraSupported(false);
    }
  }, [commit, cameraOn]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const isBarcode = isBarcodeLike(value);
  const detectedFormat: BarcodeFormat | null = value.trim() ? detectBarcodeFormat(value) : null;

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
      </div>

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

      {cameraSupported === false && (
        <p className="text-xs text-muted-foreground">
          Camera scanning is not supported in this browser (needs Chrome/Edge/Android with
          BarcodeDetector). USB / Bluetooth keyboard scanners work through the input above.
        </p>
      )}
    </div>
  );
}
