"use client";

import { Section } from "@/components/ui/section";

export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: { heading: string; body: string }[];
}) {
  return (
    <div className="page-enter">
      <section className="bg-hero-gradient py-16 text-white md:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold md:text-5xl">{title}</h1>
          <p className="mt-3 text-white/70">Last updated: {updated}</p>
        </div>
      </section>
      <Section>
        <div className="mx-auto max-w-3xl space-y-8">
          {sections.map((s) => (
            <div key={s.heading}>
              <h2 className="text-xl font-semibold">{s.heading}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
