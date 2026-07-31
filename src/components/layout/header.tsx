"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  Phone,
  Moon,
  Sun,
  Languages,
  Accessibility,
  ChevronDown,
  UserRound,
  ShieldCheck,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";
import { useAccessibility } from "@/hooks/use-accessibility";
import { Button } from "@/components/ui/button";
import { getHospital } from "@/lib/data";
import { useHospitalConfig } from "@/components/hospital/hospital-config-provider";
import { useCmsSite } from "@/hooks/use-cms-site";

const mainLinks = [
  { href: "/", key: "home" as const },
  { href: "/about", key: "about" as const },
  { href: "/doctors", key: "doctor" as const },
  { href: "/services", key: "services" as const },
  { href: "/facilities", key: "facilities" as const },
  { href: "/gallery", key: "gallery" as const },
  { href: "/blog", key: "blog" as const },
  { href: "/contact", key: "contact" as const },
];

const moreLinks = [
  { href: "/testimonials", key: "testimonials" as const },
  { href: "/insurance", key: "insurance" as const },
  { href: "/health-packages", key: "packages" as const },
  { href: "/faq", key: "faq" as const },
  { href: "/careers", key: "careers" as const },
  { href: "/video-consult", key: "videoConsult" as const },
];

const loginLinks = [
  { href: "/patient/login", key: "patientLogin" as const, icon: UserRound },
  { href: "/admin/login", key: "adminLogin" as const, icon: ShieldCheck },
];

export function Header() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const { largeText, highContrast, toggleLargeText, toggleHighContrast } =
    useAccessibility();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [a11yOpen, setA11yOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { config } = useHospitalConfig();
  const cms = useCmsSite();
  const hospital = getHospital();
  const displayName = config.branding.name || hospital.name;
  const subtitle =
    config.contact.city ||
    hospital.address?.city ||
    config.branding.tagline;
  const resolvedMainLinks = cms.header.length
    ? cms.header
        .filter((item) => item.visible)
        .sort((a, b) => a.order - b.order)
        .map((item) => ({ href: item.href, label: item.label }))
    : mainLinks.map((item) => ({ href: item.href, label: t.nav[item.key] }));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-all duration-300",
        scrolled
          ? "border-border/60 bg-background/80 shadow-soft backdrop-blur-xl"
          : "border-transparent bg-background/60 backdrop-blur-md"
      )}
    >
      <div className="container mx-auto flex h-14 min-w-0 items-center justify-between gap-2 px-3 sm:h-16 sm:gap-4 sm:px-6 lg:h-[4.25rem] lg:px-8">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-2.5"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-hero-gradient text-xs font-bold text-white shadow-glow sm:h-10 sm:w-10 sm:text-sm">
            {config.branding.logo_url &&
            !config.branding.logo_url.endsWith(".svg") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={config.branding.logo_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              displayName
                .split(/\s+/)
                .map((w) => w[0])
                .join("")
                .slice(0, 3)
                .toUpperCase()
            )}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-xs font-bold tracking-tight text-foreground min-[360px]:text-sm sm:text-base">
              {displayName}
            </div>
            <div className="hidden truncate text-[11px] text-muted-foreground sm:block">
              {subtitle}
            </div>
          </div>
        </Link>

        <nav
          className="hidden items-center gap-1 xl:flex"
          aria-label="Primary navigation"
        >
          {resolvedMainLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-primary-700",
                pathname === link.href
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                  : "text-muted-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
          {!cms.header.length && <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-primary-700"
              aria-expanded={moreOpen}
            >
              More <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute right-0 mt-2 w-52 rounded-2xl border border-border bg-card p-2 shadow-lift"
                >
                  {moreLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {t.nav[link.key]}
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "te" : "en")}
            className="inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted touch-manipulation"
            aria-label={t.common.language}
          >
            <Languages className="h-4 w-4" />
            <span className="hidden sm:inline">
              {locale === "en" ? "తెలుగు" : "EN"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted touch-manipulation"
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition dark:rotate-0 dark:scale-100" />
          </button>

          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setA11yOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              aria-label={t.common.accessibility}
            >
              <Accessibility className="h-4 w-4" />
            </button>
            <AnimatePresence>
              {a11yOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute right-0 mt-2 w-48 rounded-2xl border border-border bg-card p-2 shadow-lift"
                >
                  <button
                    type="button"
                    onClick={toggleLargeText}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-muted"
                  >
                    {t.common.largeText}
                    <span className="text-xs font-semibold text-primary-600">
                      {largeText ? "ON" : "OFF"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleHighContrast}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-muted"
                  >
                    {t.common.highContrast}
                    <span className="text-xs font-semibold text-primary-600">
                      {highContrast ? "ON" : "OFF"}
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Link href="/appointment" className="hidden md:block">
            <Button size="sm">{t.common.bookAppointment}</Button>
          </Link>

          <a
            href={`tel:+91${hospital.emergencyPhone}`}
            className="hidden 2xl:inline-flex"
            aria-label="Emergency call"
          >
            <Button variant="emergency" size="sm">
              <Phone className="h-3.5 w-3.5" />
              {t.common.emergencyCall}
            </Button>
          </a>

          <div className="hidden items-center gap-1 lg:flex">
            {loginLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-label={t.nav[link.key]}
                className="rounded-xl"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <link.icon className="h-4 w-4" aria-hidden />
                  {t.nav[link.key]}
                </Button>
              </Link>
            ))}
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border touch-manipulation xl:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="max-h-[min(80vh,640px)] overflow-y-auto overflow-x-hidden border-t border-border bg-background xl:hidden"
          >
            <nav
              className="container mx-auto flex flex-col gap-1 px-3 py-3 sm:px-4 sm:py-4"
              aria-label="Mobile navigation"
            >
              {[...mainLinks, ...moreLinks].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "min-h-11 rounded-xl px-4 py-3 text-sm font-medium touch-manipulation",
                    pathname === link.href
                      ? "bg-primary-50 text-primary-700 dark:bg-primary-950"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  {t.nav[link.key]}
                </Link>
              ))}
              <div className="mt-1 border-t border-border pt-1">
                {loginLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-label={t.nav[link.key]}
                    className="flex min-h-11 items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-foreground hover:bg-muted touch-manipulation"
                  >
                    <link.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {t.nav[link.key]}
                  </Link>
                ))}
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Link href="/appointment" className="flex-1">
                  <Button className="w-full min-h-11">
                    {t.common.bookAppointment}
                  </Button>
                </Link>
                <a
                  href={`tel:+91${hospital.emergencyPhone}`}
                  className="flex-1 sm:hidden"
                >
                  <Button variant="emergency" className="w-full min-h-11">
                    <Phone className="h-4 w-4" />
                    {t.common.emergencyCall}
                  </Button>
                </a>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
