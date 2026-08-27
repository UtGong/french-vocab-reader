import type { Metadata } from "next";
import "./globals.css";
import "./playback.css";
import "./brand.css";
import "./learned.css";

export const metadata: Metadata = {
  title: "For Taxol — Apprentissage du vocabulaire français",
  description: "Apprenez le vocabulaire français mot par mot avec une progression guidée par la voix.",
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
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
