"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search } from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { getFaqs } from "@/lib/data";
import { cn } from "@/lib/utils";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  general: "General",
  appointments: "Appointments",
  services: "Services",
  fees: "Fees",
  emergency: "Emergency",
  insurance: "Insurance",
  location: "Location",
  packages: "Packages",
  patient: "Patient portal",
  careers: "Careers",
};

export function FAQContent() {
  const faqs = getFaqs();
  const [openId, setOpenId] = useState<string | null>(faqs[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const categories = useMemo(() => {
    const set = new Set(faqs.map((f) => f.category || "general"));
    return ["all", ...Array.from(set)];
  }, [faqs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faqs.filter((f) => {
      const catOk = category === "all" || f.category === category;
      if (!catOk) return false;
      if (!q) return true;
      return (
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q)
      );
    });
  }, [faqs, query, category]);

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="faq"
        title="FAQ"
        subtitle="Quick answers to common questions about care, appointments, and hospital services."
      />
      <div className="container mx-auto px-4 pt-6 sm:px-6 lg:px-8">
        <Breadcrumb items={[{ label: "FAQ" }]} />
      </div>

      <Section>
        <SectionHeader
          badge="Help Center"
          title="Frequently Asked Questions"
          subtitle="Still need help? Use the chatbot or Contact page."
        />

        <div className="mx-auto max-w-3xl">
          <div className="relative mb-4">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions…"
              className="min-h-12 pl-10"
              aria-label="Search FAQs"
            />
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "min-h-10 rounded-full px-3.5 py-2 text-xs font-semibold capitalize transition touch-manipulation sm:text-sm",
                  category === c
                    ? "bg-primary-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {CATEGORY_LABELS[c] || c}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No matching questions"
              description="Try another search term or contact our team."
              actionLabel="Contact us"
              actionHref="/contact"
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((faq) => {
                const open = openId === faq.id;
                return (
                  <div
                    key={faq.id}
                    className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left touch-manipulation sm:px-5 min-h-14"
                      onClick={() => setOpenId(open ? null : faq.id)}
                      aria-expanded={open}
                      id={`faq-q-${faq.id}`}
                    >
                      <span className="font-semibold text-sm sm:text-base">
                        {faq.question}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 shrink-0 text-muted-foreground transition",
                          open && "rotate-180"
                        )}
                        aria-hidden
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                          role="region"
                          aria-labelledby={`faq-q-${faq.id}`}
                        >
                          <div className="border-t border-border px-4 py-4 text-sm leading-relaxed text-muted-foreground sm:px-5">
                            {faq.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-10 rounded-2xl border border-border bg-muted/40 p-5 text-center sm:p-6">
            <p className="text-sm text-muted-foreground">
              Didn&apos;t find your answer?
            </p>
            <div className="mt-4 flex flex-col justify-center gap-2 min-[400px]:flex-row">
              <Link href="/contact">
                <Button className="w-full min-h-11 min-[400px]:w-auto">
                  Contact support
                </Button>
              </Link>
              <Link href="/appointment">
                <Button
                  variant="outline"
                  className="w-full min-h-11 min-[400px]:w-auto"
                >
                  Book appointment
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
