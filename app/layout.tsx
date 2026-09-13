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
};

/**
 * Aplica o tema salvo antes da primeira pintura.
 *
 * Sem isto, quem usa tema escuro vê um flash branco a cada carga enquanto o
 * React monta e lê o `localStorage`. É a mesma lógica de `lib/themes.ts`,
 * repetida aqui de propósito: precisa rodar síncrono, antes do bundle.
 */
const THEME_BOOTSTRAP = `
(function () {
  try {
    var prefs = JSON.parse(localStorage.getItem("live-translation:preferences") || "{}");
    var id = prefs.theme || "light";
    if (id === "system") {
      id = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.dataset.theme = id;
    if (id === "dark" || id === "amber") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `suppressHydrationWarning`: o script acima troca `data-theme` e a classe
    // `dark` na raiz antes da hidratação, de propósito. Sem isto o React
    // reclama de uma diferença que ele mesmo foi instruído a produzir.
    <html
      lang="pt-BR"
      className={`${FONT_VARIABLES} font-sans`}
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
