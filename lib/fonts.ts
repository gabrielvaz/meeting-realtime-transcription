import {
  Atkinson_Hyperlegible,
  IBM_Plex_Sans,
  Inter,
  JetBrains_Mono,
  Source_Serif_4,
} from "next/font/google";

/**
 * As cinco fontes que a legenda pode usar.
 *
 * A escolha não é estética por estética: cada uma resolve um problema
 * diferente de projeção. Inter é a neutra; Atkinson Hyperlegible foi desenhada
 * para legibilidade a distância e com baixa visão; Source Serif segura leitura
 * longa; IBM Plex Sans tem letras mais abertas que a Inter; JetBrains Mono
 * alinha colunas quando há vários idiomas lado a lado.
 *
 * Só a Inter carrega cirílico e vietnamita. Nas outras, russo e vietnamita
 * caem no fallback do sistema — está documentado no README.
 */

const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic", "vietnamese"],
  display: "swap",
  variable: "--font-sans",
});

const atkinson = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-atkinson",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-source-serif",
});

const plexSans = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-plex-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-jetbrains",
});

/** Todas as variáveis, aplicadas de uma vez no `<html>`. */
export const FONT_VARIABLES = [
  inter.variable,
  atkinson.variable,
  sourceSerif.variable,
  plexSans.variable,
  jetbrainsMono.variable,
].join(" ");

export type CaptionFontId =
  | "inter"
  | "atkinson"
  | "source-serif"
  | "plex-sans"
  | "jetbrains";

/**
 * O fallback para CJK e devanágari vem depois em toda variante: Inter,
 * Atkinson, Source Serif, Plex e JetBrains não cobrem esses alfabetos, e sem a
 * cauda do sistema japonês e híndi viram retângulos vazios.
 */
const SYSTEM_FALLBACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans CJK SC", "Noto Sans Devanagari", "Apple SD Gothic Neo"';

export const CAPTION_FONTS: ReadonlyArray<{
  id: CaptionFontId;
  label: string;
  note: string;
  stack: string;
}> = [
  {
    id: "inter",
    label: "Inter",
    note: "Neutra. Única com cirílico e vietnamita.",
    stack: `var(--font-sans), ${SYSTEM_FALLBACK}, sans-serif`,
  },
  {
    id: "atkinson",
    label: "Atkinson Hyperlegible",
    note: "Desenhada para legibilidade a distância.",
    stack: `var(--font-atkinson), ${SYSTEM_FALLBACK}, sans-serif`,
  },
  {
    id: "source-serif",
    label: "Source Serif",
    note: "Serifada, para leitura longa.",
    stack: `var(--font-source-serif), ${SYSTEM_FALLBACK}, serif`,
  },
  {
    id: "plex-sans",
    label: "IBM Plex Sans",
    note: "Letras mais abertas que a Inter.",
    stack: `var(--font-plex-sans), ${SYSTEM_FALLBACK}, sans-serif`,
  },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    note: "Monoespaçada, alinha colunas.",
    stack: `var(--font-jetbrains), ${SYSTEM_FALLBACK}, monospace`,
  },
];

export function getCaptionFont(id: CaptionFontId) {
  return CAPTION_FONTS.find((font) => font.id === id) ?? CAPTION_FONTS[0];
}
