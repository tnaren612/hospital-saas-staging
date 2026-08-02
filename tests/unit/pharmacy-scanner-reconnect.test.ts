/**
 * Pharmacy Barcode — mobile scanner reconnect + memory hardening tests.
 *
 * Guards the M6 transport changes: bounded exponential backoff, no infinite
 * retry, cancel-on-connect, remember/forget of the last paired scanner, and
 * opt-out via autoReconnect:false. Uses an injectable scheduler so no real
 * timers are involved.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type BluetoothCharacteristicLike,
  type BluetoothDeviceLike,
  type BluetoothNavigatorLike,
  type BluetoothServerLike,
  MobileScannerGattTransport,
} from "../../src/lib/pharmacy/barcode/bluetooth";

// ---------------------------------------------------------------------------
// Manual scheduler harness (deterministic, no real timers)
// ---------------------------------------------------------------------------

type ScheduledTask = { fn: () => void; ms: number; id: number };

function makeScheduler() {
  const tasks: ScheduledTask[] = [];
  let nextId = 1;
  const schedule = (fn: () => void, ms: number) => {
    const task = { fn, ms, id: nextId++ };
    tasks.push(task);
    return task.id;
  };
  const cancel = (handle: unknown) => {
    const i = tasks.findIndex((t) => t.id === handle);
    if (i >= 0) tasks.splice(i, 1);
  };
  const pending = () => tasks.map((t) => t.ms).sort((a, b) => a - b);
  const runNext = () => {
    const task = tasks.shift();
    if (task) task.fn();
  };
  return { schedule, cancel, pending, runNext };
}

type SimulatedDevice = {
  device: BluetoothDeviceLike;
  setConnectFail(shouldFail: boolean): void;
  simulateDisconnect(): void;
};

function makeDevice(serverFailure = false): SimulatedDevice {
  let failConnect = serverFailure;
  let disconnectListener: (() => void) | null = null;
  const characteristic: BluetoothCharacteristicLike = {
    value: null,
    addEventListener() {},
    async startNotifications() {
      return characteristic;
    },
  };
  const server: BluetoothServerLike = {
    connected: true,
    async connect() {
      if (failConnect) throw new Error("gatt link down");
      server.connected = true;
      return server;
    },
    disconnect() {
      server.connected = false;
      disconnectListener?.();
    },
    async getPrimaryService() {
      return {
        async getCharacteristic() {
          return characteristic;
        },
      };
    },
  };
  const device: BluetoothDeviceLike = {
    name: "Phone Scanner X",
    gatt: server,
    addEventListener(_type: string, fn: () => void) {
      disconnectListener = fn;
    },
    removeEventListener() {},
  };
  return {
    device,
    setConnectFail(shouldFail: boolean) {
      failConnect = shouldFail;
    },
    simulateDisconnect() {
      server.disconnect();
    },
  };
}

function makeBluetooth(device: BluetoothDeviceLike): BluetoothNavigatorLike {
  return {
    async requestDevice() {
      return device;
    },
  };
}

function makeStatuses() {
  const statuses: Array<{ status: string; name?: string; attempt?: number }> = [];
  return {
    statuses,
    onStatus: (
      status: string,
      name?: string,
      attempt?: number
    ) => statuses.push({ status, name, attempt }),
  };
}

function makeMemory() {
  const map = new Map<string, string>();
  return {
    store: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
    size: () => map.size,
  };
}

/** Flush pending microtasks (attach() resolves asynchronously). */
function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Reconnect behavior
// ---------------------------------------------------------------------------

test("bluetooth: transient disconnect auto-reconnects with bounded exponential backoff", async () => {
  const sched = makeScheduler();
  const device = makeDevice();
  const { statuses, onStatus } = makeStatuses();
  const transport = new MobileScannerGattTransport(
    makeBluetooth(device.device),
    {
      onScan: () => {},
      onStatus,
      onError: () => {},
    },
    {
      schedule: sched.schedule,
      cancel: sched.cancel,
      reconnectBaseMs: 1000,
      reconnectCapMs: 16000,
      maxReconnectAttempts: 5,
    }
  );

  await transport.connect();
  assert.equal(transport.getStatus(), "connected");

  // Drop the link: backoff should be 1s, 2s, 4s, 8s, 16s (capped).
  device.simulateDisconnect();
  assert.equal(transport.getStatus(), "disconnected");
  assert.deepEqual(sched.pending(), [1000]);

  sched.runNext(); // attempt 1 succeeds
  await flush();
  assert.equal(transport.getStatus(), "connected");
  assert.ok(
    statuses.some((s) => s.status === "connecting" && s.attempt === 1),
    "reconnect must report the attempt number"
  );
  assert.deepEqual(sched.pending(), [], "no further backoff after success");

  // Second drop, fail the first reattach → next backoff is 2s. Between
  // attempts the transport reports "connecting" (UI: "Reconnecting… n/5").
  device.setConnectFail(true);
  device.simulateDisconnect();
  assert.equal(transport.getStatus(), "disconnected");
  assert.deepEqual(sched.pending(), [1000]);
  sched.runNext(); // attempt 1 fails (gatt link down)
  await flush();
  assert.equal(transport.getStatus(), "connecting");
  assert.deepEqual(sched.pending(), [2000], "backoff must double");
  sched.runNext(); // attempt 2 still fails
  await flush();
  assert.deepEqual(sched.pending(), [4000]);
  sched.runNext();
  await flush();
  assert.deepEqual(sched.pending(), [8000]);
  sched.runNext();
  await flush();
  assert.deepEqual(sched.pending(), [16000], "backoff must cap at 16s");
  device.setConnectFail(false);
  sched.runNext(); // attempt 5 succeeds
  await flush();
  assert.equal(transport.getStatus(), "connected");
});

test("bluetooth: reconnect stops after max attempts — no infinite loop", async () => {
  const sched = makeScheduler();
  const device = makeDevice();
  const { statuses, onStatus } = makeStatuses();
  const transport = new MobileScannerGattTransport(
    makeBluetooth(device.device),
    { onScan: () => {}, onStatus, onError: () => {} },
    {
      schedule: sched.schedule,
      cancel: sched.cancel,
      maxReconnectAttempts: 2,
      reconnectBaseMs: 100,
    }
  );

  await transport.connect();
  device.setConnectFail(true);
  device.simulateDisconnect();
  sched.runNext(); // attempt 1 fails
  await flush();
  sched.runNext(); // attempt 2 fails → exhausted
  await flush();
  assert.equal(transport.getStatus(), "disconnected");
  assert.deepEqual(sched.pending(), [], "no further attempts after exhaustion");
  const attempts = statuses.filter(
    (s) => s.status === "connecting" && typeof s.attempt === "number"
  );
  assert.equal(attempts.length, 2, "exactly two reconnect attempts");

  // After exhaustion the device is released; a fresh user-gesture connect works.
  device.setConnectFail(false);
  await transport.connect();
  assert.equal(transport.getStatus(), "connected");
});

test("bluetooth: user connect() cancels an in-flight backoff", async () => {
  const sched = makeScheduler();
  const device = makeDevice();
  const transport = new MobileScannerGattTransport(
    makeBluetooth(device.device),
    { onScan: () => {}, onStatus: () => {}, onError: () => {} },
    { schedule: sched.schedule, cancel: sched.cancel }
  );
  await transport.connect();
  device.simulateDisconnect();
  assert.equal(sched.pending().length, 1);
  await transport.connect();
  assert.deepEqual(sched.pending(), [], "pending backoff must be cancelled");
  assert.equal(transport.getStatus(), "connected");
});

test("bluetooth: autoReconnect:false surfaces the drop and stays parked", async () => {
  const sched = makeScheduler();
  const device = makeDevice();
  const transport = new MobileScannerGattTransport(
    makeBluetooth(device.device),
    { onScan: () => {}, onStatus: () => {}, onError: () => {} },
    { schedule: sched.schedule, cancel: sched.cancel, autoReconnect: false }
  );
  await transport.connect();
  device.simulateDisconnect();
  assert.equal(transport.getStatus(), "disconnected");
  assert.deepEqual(sched.pending(), [], "no backoff when auto-reconnect is off");
  await transport.connect();
  assert.equal(transport.getStatus(), "connected");
});

test("bluetooth: disconnect() cancels backoff and releases the device", async () => {
  const sched = makeScheduler();
  const device = makeDevice();
  const transport = new MobileScannerGattTransport(
    makeBluetooth(device.device),
    { onScan: () => {}, onStatus: () => {}, onError: () => {} },
    { schedule: sched.schedule, cancel: sched.cancel }
  );
  await transport.connect();
  device.simulateDisconnect();
  assert.equal(sched.pending().length, 1);
  transport.disconnect();
  assert.deepEqual(sched.pending(), [], "disconnect must cancel pending backoff");
  assert.equal(transport.getStatus(), "disconnected");
});

// ---------------------------------------------------------------------------
// Scanner memory
// ---------------------------------------------------------------------------

test("bluetooth: successful pairing remembers the scanner; forget clears it", async () => {
  const { store, size } = makeMemory();
  const device = makeDevice();
  const transport = new MobileScannerGattTransport(
    makeBluetooth(device.device),
    { onScan: () => {}, onStatus: () => {}, onError: () => {} },
    { schedule: () => 0, cancel: () => {}, memoryStorage: store }
  );
  assert.equal(transport.getRememberedScannerName(), null);
  assert.equal(size(), 0);

  await transport.connect();
  assert.equal(transport.getRememberedScannerName(), "Phone Scanner X");
  assert.equal(size(), 1);

  transport.forgetScanner();
  assert.equal(transport.getRememberedScannerName(), null);
  assert.equal(size(), 0);
});

test("bluetooth: memory degrades gracefully when storage is unavailable", () => {
  const transport = new MobileScannerGattTransport(
    makeBluetooth(makeDevice().device),
    { onScan: () => {}, onStatus: () => {}, onError: () => {} },
    { schedule: () => 0, cancel: () => {}, memoryStorage: null }
  );
  assert.equal(transport.getRememberedScannerName(), null);
  transport.forgetScanner();
  assert.doesNotThrow(() => transport.getRememberedScannerName());
});
