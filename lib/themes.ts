/**
 * Temas prontos.
 *
 * Cada tema é um conjunto de variáveis CSS aplicadas na raiz via
 * `data-theme`; as regras vivem em `app/globals.css`. O campo `dark` controla a
 * classe `dark` que os componentes do shadcn usam para inverter os próprios
 * tokens.
 *
 * O critério de escolha não é estético: são situações de sala. Projetor apagado
 * pede fundo escuro; sala clara pede fundo branco; reunião longa lendo texto
 * pede papel; projetor ruim pede alto contraste.
 */

export type ThemeId =
  | "system"
  | "light"
  | "dark"
  | "paper"
  | "contrast"
  | "amber";

export const THEMES: ReadonlyArray<{
  id: ThemeId;
  label: string;
  note: string;
  /** Amostra: [fundo, texto] — usada no seletor. */
  swatch: [string, string];
}> = [
  {
    id: "system",
    label: "Sistema",
    note: "Acompanha o modo claro ou escuro do computador.",
    swatch: ["#ffffff", "#101010"],
  },
  {
    id: "light",
    label: "Claro",
    note: "Branco. O padrão, para sala iluminada.",
    swatch: ["#ffffff", "#101010"],
  },
  {
    id: "dark",
    label: "Escuro",
    note: "Para sala com luz apagada e projetor ligado.",
    swatch: ["#0d0d0d", "#ededed"],
  },
  {
    id: "paper",
    label: "Papel",
    note: "Fundo quente, menos cansativo em reunião longa.",
    swatch: ["#f6f1e7", "#2b2419"],
  },
  {
    id: "contrast",
    label: "Alto contraste",
    note: "Preto puro no branco puro, para projetor ruim.",
    swatch: ["#ffffff", "#000000"],
  },
  {
    id: "amber",
    label: "Âmbar",
    note: "Escuro com texto âmbar, para sala às escuras.",
    swatch: ["#0b0b0b", "#ffb454"],
  },
];

export function getTheme(id: string) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[1];
}

/**
 * Aplica o tema na raiz do documento.
 *
 * Vive fora do React de propósito: o mesmo código roda no script inline do
 * `layout.tsx`, antes da primeira pintura, para a tela não piscar branca antes
 * de virar escura.
 */
export function applyTheme(id: string, root: HTMLElement): void {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const resolved = id === "system" ? (prefersDark ? "dark" : "light") : id;
  root.dataset.theme = resolved;
  root.classList.toggle("dark", resolved === "dark" || resolved === "amber");
}
