import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@/components/dev/dev-panel.css";
import { DevPanelRoot } from "@/components/dev/DevPanelRoot";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { SessionKeepalive } from "@/components/auth/SessionKeepalive";
import { initWhatsAppProvider } from "@/lib/notifications/whatsapp-provider";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

initWhatsAppProvider();

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "600", "700"],
  preload: true,
});

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
  applicationName: BRAND_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRAND_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  // Prefer .json — PWA Builder and many store tools look for /manifest.json.
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#15110D' },
    { media: '(prefers-color-scheme: light)', color: '#15110D' },
    { color: '#15110D' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <SessionKeepalive />
        <PwaRegister />
        <MetaPixel />
        <DevPanelRoot />
      </body>
    </html>
  );
}
