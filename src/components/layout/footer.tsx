"use client";

import Link from "next/link";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Share2,
  Globe,
  ExternalLink,
} from "lucide-react";
import { getHospital, getServices } from "@/lib/data";
import { formatPhone, getTelUrl } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

export function Footer() {
  const hospital = getHospital();
  const services = getServices().slice(0, 6);
  const { t } = useLocale();
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden border-t border-border bg-primary-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-mesh opacity-30" />
      <div className="container relative mx-auto px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid gap-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-sm font-bold backdrop-blur">
                SSH
              </div>
              <div>
                <div className="font-bold">{hospital.name}</div>
                <div className="text-xs text-white/60">{hospital.tagline}</div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-white/70">
              Specialist pulmonology, critical care, and compassionate respiratory
              medicine serving Badvel and surrounding communities.
            </p>
            <div className="mt-5 flex gap-3">
              {hospital.social.facebook && (
                <a
                  href={hospital.social.facebook}
                  className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
                  aria-label="Facebook"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Share2 className="h-4 w-4" />
                </a>
              )}
              {hospital.social.instagram && (
                <a
                  href={hospital.social.instagram}
                  className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
                  aria-label="Instagram"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Globe className="h-4 w-4" />
                </a>
              )}
              {hospital.social.youtube && (
                <a
                  href={hospital.social.youtube}
                  className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
                  aria-label="YouTube"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/90">
              {t.footer.quickLinks}
            </h3>
            <ul className="space-y-2.5 text-sm text-white/70">
              {[
                { href: "/about", label: t.nav.about },
                { href: "/doctors", label: t.nav.doctor },
                { href: "/appointment", label: t.nav.appointment },
                { href: "/blog", label: t.nav.blog },
                { href: "/faq", label: t.nav.faq },
                { href: "/careers", label: t.nav.careers },
                { href: "/contact", label: t.nav.contact },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/90">
              {t.footer.services}
            </h3>
            <ul className="space-y-2.5 text-sm text-white/70">
              {services.map((s) => (
                <li key={s.id}>
                  <Link href="/services" className="hover:text-white">
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/90">
              {t.footer.contact}
            </h3>
            <ul className="space-y-3 text-sm text-white/70">
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-300" />
                <span>
                  {hospital.address.line1}, {hospital.address.line2},{" "}
                  {hospital.address.city}, {hospital.address.state}{" "}
                  {hospital.address.pincode}
                </span>
              </li>
              {hospital.phones.map((p) => (
                <li key={p} className="flex gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary-300" />
                  <a href={getTelUrl(p)} className="hover:text-white">
                    {formatPhone(p)}
                  </a>
                </li>
              ))}
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary-300" />
                <a href={`mailto:${hospital.email}`} className="hover:text-white">
                  {hospital.email}
                </a>
              </li>
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary-300" />
                <span>
                  {hospital.timings.opd}
                  <br />
                  {hospital.timings.emergency}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-center text-sm text-white/50 sm:mt-12 sm:flex-row sm:text-left">
          <p>
            © {year} {hospital.name}. {t.footer.rights}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <Link href="/privacy" className="min-h-10 py-2 hover:text-white">
              {t.footer.privacy}
            </Link>
            <Link href="/terms" className="min-h-10 py-2 hover:text-white">
              {t.footer.terms}
            </Link>
            <Link href="/admin/login" className="min-h-10 py-2 hover:text-white">
              {t.nav.admin}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
