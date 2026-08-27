import type { Metadata } from "next";
import "./globals.css";
import "./playback.css";
import "./brand.css";
import "./learned.css";

export const metadata: Metadata = {
  title: "For Taxol — French vocabulary reader",
  description: "Practice French vocabulary one word at a time with voice-guided progress.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
