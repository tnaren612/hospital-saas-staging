"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: "rgba(220,38,38,0.2)",
              letterSpacing: "-0.05em",
            }}
          >
            500
          </div>
          <h1 style={{ fontSize: 24, margin: "8px 0" }}>
            Application error
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
            A critical error occurred. Please refresh the page. If the problem
            continues, contact the hospital directly.
          </p>
          {error?.digest && (
            <p
              style={{
                fontFamily: "monospace",
                fontSize: 12,
                color: "#94a3b8",
              }}
            >
              Ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "12px 20px",
              borderRadius: 12,
              border: "none",
              background: "#1a5ff5",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
