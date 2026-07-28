"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  container?: boolean;
}

export function Section({
  children,
  className,
  id,
  container = true,
}: SectionProps) {
  return (
    <section id={id} className={cn("py-12 sm:py-16 md:py-24", className)}>
      {container ? (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
      ) : (
        children
      )}
    </section>
  );
}

export function SectionHeader({
  badge,
  title,
  subtitle,
  align = "center",
  className,
}: {
  badge?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className={cn(
        "mb-8 max-w-3xl sm:mb-10 md:mb-12",
        align === "center" && "mx-auto text-center",
        className
      )}
    >
      {badge && (
        <span className="mb-3 inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-700 dark:bg-primary-950 dark:text-primary-300">
          {badge}
        </span>
      )}
      <h2 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl lg:text-[2.75rem]">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base md:text-lg">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
