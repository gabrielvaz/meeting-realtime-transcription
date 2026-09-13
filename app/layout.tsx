import type { Metadata, Viewport } from "next";

import "./globals.css";
import { FONT_VARIABLES } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Tradução ao vivo",
  description:
    "Tradução simultânea de voz com a Realtime Translation API da OpenAI.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `--font-sans` (a Inter) é o que os componentes do shadcn consomem via
    // `font-sans`; as outras quatro só valem para a legenda.
    <html lang="pt-BR" className={`${FONT_VARIABLES} font-sans`}>
      <body>{children}</body>
    </html>
  );
}
