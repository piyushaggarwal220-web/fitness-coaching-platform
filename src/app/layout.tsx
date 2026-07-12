import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@/components/dev/dev-panel.css";
import { DevPanelRoot } from "@/components/dev/DevPanelRoot";
import { initWhatsAppProvider } from "@/lib/notifications/whatsapp-provider";

initWhatsAppProvider();

import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <DevPanelRoot />
      </body>
    </html>
  );
}
