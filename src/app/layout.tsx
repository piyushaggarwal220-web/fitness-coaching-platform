import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@/components/dev/dev-panel.css";
import { DevPanelRoot } from "@/components/dev/DevPanelRoot";
import { initWhatsAppProvider } from "@/lib/notifications/whatsapp-provider";

initWhatsAppProvider();

export const metadata: Metadata = {
  title: "Fitness Coaching Platform",
  description: "Track your fitness journey",
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
      <body style={{ margin: 0, fontFamily: 'Arial, sans-serif', backgroundColor: '#f5f5f5' }}>
        {children}
        <DevPanelRoot />
      </body>
    </html>
  );
}
