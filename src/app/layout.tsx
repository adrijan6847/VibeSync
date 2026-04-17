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

export const metadata: Metadata = {
  title: "VibeSync — one room, one frequency",
  description:
    "A shared live experience. Join the session. Raise the room. Feel the drop together.",
};

export const viewport: Viewport = {
  themeColor: "#070809",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      <body className="min-h-full">{children}</body>
    </html>
  );
}
