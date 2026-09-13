/**
 * Dicionário de correção de termos, aplicado ao texto que chega da API.
 *
 * Por que no cliente: `gpt-realtime-translate` **não aceita glossário**. A
 * documentação é explícita — "The model does not currently support custom
 * prompts, glossaries, or pronunciation guides" — e o modelo também não aceita
 * `prompt` nem `keywords`, ao contrário dos modelos de transcrição pura. Não há
 * como ensinar o termo certo à API; só corrigir a saída.
 *
 * O que isto corrige e o que não corrige:
 *
 * - **Corrige** forma de superfície: "Cardio Line", "cardiolaine" e "Holder"
 *   viram "Cardioline" e "Holter", tanto na transcrição original quanto nas
 *   traduções.
 * - **Não corrige** sentido. Se o modelo entendeu outra coisa e traduziu a
 *   frase inteira errado, substituir palavra não conserta.
 *
 * A correção roda sobre o texto **acumulado**, nunca sobre o delta isolado:
 * "Cardioline" costuma chegar partido em vários fragmentos, e casar em cima de
 * um fragmento solto nunca funcionaria.
 */

const GLOSSARY_KEY = "live-translation:glossary";

export interface GlossaryEntry {
  id: string;
  /** A forma correta, que vai para a tela. */
  term: string;
  /** O que costuma sair errado. Uma por linha ou separadas por vírgula. */
  variants: string[];
}

/**
 * Termos de partida. São os do primeiro uso desta ferramenta e servem tanto de
 * valor útil quanto de exemplo de formato — dá para apagar todos.
 */
export const DEFAULT_GLOSSARY: GlossaryEntry[] = [
  { id: "g_cardioline", term: "Cardioline", variants: ["cardio line", "cardiolaine", "cardio lane", "cardioláine"] },
  { id: "g_cardios", term: "Cardios", variants: ["cardius", "cárdios", "cardio's"] },
  { id: "g_holter", term: "Holter", variants: ["holder", "rolter", "voltar", "olter", "holte"] },
  { id: "g_ecg", term: "ECG", variants: ["e c g", "ecg", "e.c.g.", "eletro"] },
];

/* ------------------------------------------------------------------ */
/* Armazenamento                                                      */
/* ------------------------------------------------------------------ */

export function loadGlossary(): GlossaryEntry[] {
  if (typeof window === "undefined") return DEFAULT_GLOSSARY;
  try {
    const raw = window.localStorage.getItem(GLOSSARY_KEY);
    if (raw === null) return DEFAULT_GLOSSARY;
    const parsed = JSON.parse(raw) as GlossaryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return DEFAULT_GLOSSARY;
  }
}

export function saveGlossary(entries: GlossaryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLOSSARY_KEY, JSON.stringify(entries));
  } catch {
    /* cota cheia: o dicionário é o que menos importa perder */
  }
}

export function newEntryId(): string {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function parseVariants(input: string): string[] {
  return input
    .split(/[,\n;]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Compilação                                                         */
/* ------------------------------------------------------------------ */

const ACCENT_GROUPS: Record<string, string> = {
  a: "aáàâãä",
  e: "eéèêë",
  i: "iíìîï",
  o: "oóòôõö",
  u: "uúùûü",
  c: "cç",
  n: "nñ",
};

function foldChar(char: string): string {
  const lower = char.toLowerCase();
  const group = ACCENT_GROUPS[lower];
  return group ? `[${group}${group.toUpperCase()}]` : escapeRegex(char);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Uma variante vira um padrão tolerante a acento e a espaçamento: "e c g"
 * também casa "e  c  g", e "cardio line" casa "cardio-line".
 */
function variantToPattern(variant: string): string {
  return variant
    .trim()
    .split(/\s+/)
    .map((word) => [...word].map(foldChar).join(""))
    .join("[\\s\\-]+");
}

export interface CompiledGlossary {
  rules: Array<{ pattern: RegExp; replacement: string }>;
  size: number;
}

export function compileGlossary(entries: readonly GlossaryEntry[]): CompiledGlossary {
  const rules: CompiledGlossary["rules"] = [];

  for (const entry of entries) {
    const term = entry.term.trim();
    if (!term) continue;

    // Variantes mais longas primeiro: senão "ecg" consome o começo de "ecg-12".
    const variants = [...entry.variants]
      .map((variant) => variant.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    for (const variant of variants) {
      // Uma variante idêntica ao termo correto só geraria trabalho à toa.
      if (variant.toLowerCase() === term.toLowerCase()) continue;
      rules.push({
        // `\b` não funciona quando a variante começa ou termina em pontuação,
        // então usamos lookaround por caractere de palavra.
        pattern: new RegExp(`(?<![\\p{L}\\p{N}])${variantToPattern(variant)}(?![\\p{L}\\p{N}])`, "giu"),
        replacement: term,
      });
    }
  }

  return { rules, size: rules.length };
}

export function applyGlossary(text: string, glossary: CompiledGlossary): string {
  if (!text || glossary.size === 0) return text;
  let result = text;
  for (const rule of glossary.rules) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

/** Função pronta para passar ao SubtitleBuffer. */
export function glossaryTransform(
  glossary: CompiledGlossary,
): ((text: string) => string) | undefined {
  if (glossary.size === 0) return undefined;
  return (text) => applyGlossary(text, glossary);
}
