/**
 * Enterprise Pharmacy — Cloud Reachability & Offline-First Bootstrap (client)
 *
 * Re-exports the framework-free core (classifier, bootstrap, monitor) and adds
 * the React hook for live cloud status. The core lives in `./cloud-core` so
 * server routes can import the classifier without pulling React into the RSC
 * graph; this module is client-only.
 */

import { useEffect, useRef, useState } from "react";
import {
  type CloudFailureKind,
  type CloudStatusInfo,
  createCloudMonitor,
  defaultCloudProbe,
  type CloudMonitor,
} from "./cloud-core";

export * from "./cloud-core";

/**
 * Live cloud status for the POS: probes on mount, on navigator online/offline
 * events, and on a bounded cadence (15s unavailable / 60s connected). The
 * probe respects auth: 401/403 produce "error", never "unavailable".
 */
export function useCloudStatus(opts?: {
  baseUrl?: string;
  probe?: () => Promise<"ok" | CloudFailureKind>;
}): CloudStatusInfo & { refresh: () => Promise<void> } {
  const [info, setInfo] = useState<CloudStatusInfo>({
    state: "connected",
    kind: null,
    message: null,
  });
  const monitorRef = useRef<CloudMonitor | null>(null);

  useEffect(() => {
    const monitor = createCloudMonitor({
      probe: opts?.probe ?? defaultCloudProbe(opts?.baseUrl),
      onState: (state, detail) => {
        setInfo({ state, kind: detail.kind, message: detail.message });
      },
    });
    monitorRef.current = monitor;
    monitor.start();
    const onNetworkEvent = () => void monitor.refresh();
    window.addEventListener("online", onNetworkEvent);
    window.addEventListener("offline", onNetworkEvent);
    return () => {
      monitor.stop();
      monitorRef.current = null;
      window.removeEventListener("online", onNetworkEvent);
      window.removeEventListener("offline", onNetworkEvent);
    };
  }, [opts?.baseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...info,
    refresh: () => monitorRef.current?.refresh() ?? Promise.resolve(),
  };
}
