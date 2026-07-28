/**
 * Structured payment logging — never logs secrets or card data.
 */

type LogLevel = "info" | "warn" | "error";

function emit(
  level: LogLevel,
  event: string,
  details?: Record<string, unknown>
) {
  const payload = {
    scope: "payments",
    event,
    level,
    ts: new Date().toISOString(),
    ...sanitize(details || {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const SECRET_KEYS = /secret|password|authorization|signature|card|cvv|token/i;

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sanitize(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const paymentLog = {
  info: (event: string, details?: Record<string, unknown>) =>
    emit("info", event, details),
  warn: (event: string, details?: Record<string, unknown>) =>
    emit("warn", event, details),
  error: (event: string, details?: Record<string, unknown>) =>
    emit("error", event, details),
};
