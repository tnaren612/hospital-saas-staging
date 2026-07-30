import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { EmergencyBanner } from "@/components/layout/emergency-banner";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ClientWidgets } from "@/components/layout/client-widgets";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { WebVitalsReporter } from "@/components/analytics/web-vitals";
import {
  createMetadata,
  hospitalJsonLd,
  medicalBusinessJsonLd,
} from "@/lib/seo";
import { getHospitalConfig } from "@/lib/hospital/service";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const config = await getHospitalConfig();
  return {
    ...createMetadata({ config }),
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: config.branding.name,
    },
    icons: {
      icon: config.branding.favicon_url || "/favicon.ico",
      apple: config.branding.logo_url || "/icons/icon-192.svg",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1a5ff5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = await getHospitalConfig();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(hospitalJsonLd(config)),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(medicalBusinessJsonLd(config)),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-w-0 overflow-x-hidden font-sans antialiased`}
      >
        <AppProviders>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <EmergencyBanner />
          <Header />
          <main id="main-content" className="min-h-[70vh] min-w-0">
            {children}
          </main>
          <Footer />
          <ClientWidgets />
          <ServiceWorkerRegister />
          <WebVitalsReporter />
          <GoogleAnalytics />
        </AppProviders>
      </body>
    </html>
  );
}
