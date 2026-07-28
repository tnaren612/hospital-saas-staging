export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page…</span>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="h-8 w-2/3 animate-pulse rounded-xl bg-muted" />
        <div className="h-4 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-5/6 animate-pulse rounded-lg bg-muted" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
