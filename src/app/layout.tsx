import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fitness Coaching Platform",
  description: "Track your fitness journey",
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
      </body>
    </html>
  );
}