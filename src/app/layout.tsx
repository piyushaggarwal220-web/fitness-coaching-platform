import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import "@/components/dev/dev-panel.css";
import { DevPanelRoot } from "@/components/dev/DevPanelRoot";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { PendingMetaPurchaseFlush } from "@/components/analytics/PendingMetaPurchaseFlush";
import { PhoneViewportLock } from "@/components/pwa/PhoneViewportLock";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { ChunkLoadRecovery } from "@/components/pwa/ChunkLoadRecovery";
import { SessionKeepalive } from "@/components/auth/SessionKeepalive";
import { ClientPortalRoot } from "@/components/ui/ClientPortalRoot";
import { initWhatsAppProvider } from "@/lib/notifications/whatsapp-provider";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { PHONE_VIEWPORT_BOOTSTRAP } from "@/lib/phone-viewport";

initWhatsAppProvider();

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
  applicationName: BRAND_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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
  themeColor: '#f4efe6',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={manrope.variable} data-scroll-behavior="smooth">
      <body>
        <script dangerouslySetInnerHTML={{ __html: PHONE_VIEWPORT_BOOTSTRAP }} />
        <ClientPortalRoot />
        {children}
        <SessionKeepalive />
        <ChunkLoadRecovery />
        <PhoneViewportLock />
        <PwaRegister />
        <MetaPixel />
        <PendingMetaPurchaseFlush />
        <DevPanelRoot />
      </body>
    </html>
  );
}
