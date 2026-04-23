import type { Metadata, Viewport } from "next";
import { Manrope, Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Manrope: clean, geometric sans for UI.
const sans = Manrope({
  variable: "--font-sans-ui",
  subsets: ["latin"],
  display: "swap",
});

// Archivo: sharp, confident display for hero moments.
const display = Archivo({
  variable: "--font-display",
  weight: ["400", "500", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

// JetBrains Mono: precise, technical monospace.
const mono = JetBrains_Mono({
  variable: "--font-mono-ui",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const tagline =
  "A shared live experience. Join the session. Raise the room. Feel the drop together.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "VibeSync — one room, one frequency",
  description: tagline,
  openGraph: {
    type: "website",
    siteName: "VibeSync",
    title: "VibeSync — one room, one frequency",
    description: tagline,
  },
  twitter: {
    card: "summary_large_image",
    title: "VibeSync — one room, one frequency",
    description: tagline,
  },
};

export const viewport: Viewport = {
  themeColor: "#070809",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable} h-full`}
    >
      {/* suppressHydrationWarning tolerates browser extensions (Grammarly,
          password managers, etc.) that inject data-* attributes on <body>
          before React hydrates. */}
      <body className="min-h-full" suppressHydrationWarning>{children}</body>
    </html>
  );
}
