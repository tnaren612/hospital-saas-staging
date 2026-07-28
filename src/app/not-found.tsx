import Link from "next/link";
import { Home, CalendarCheck } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-20">
      <div className="max-w-lg text-center">
        <div className="text-8xl font-black tracking-tighter text-primary-600/20">
          404
        </div>
        <h1 className="mt-2 text-3xl font-bold">Page not found</h1>
        <p className="mt-3 text-muted-foreground">
          The page you are looking for may have been moved or does not exist.
          Let us help you get back to care.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary-600 px-5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            <Home className="h-4 w-4" />
            Back to Home
          </Link>
          <Link
            href="/appointment"
            className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-primary-600 px-5 text-sm font-semibold text-primary-700 hover:bg-primary-50 dark:text-primary-300"
          >
            <CalendarCheck className="h-4 w-4" />
            Book Appointment
          </Link>
        </div>
      </div>
    </div>
  );
}
