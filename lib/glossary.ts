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
/** Termos padrão que o usuário apagou. Não voltam sozinhos. */
const DISMISSED_KEY = "live-translation:glossary-dismissed";

export interface GlossaryEntry {
  id: string;
  /** A forma correta, que vai para a tela. */
  term: string;
  /** O que costuma sair errado. Uma por linha ou separadas por vírgula. */
  variants: string[];
}

/**
 * Dicionário de partida.
 *
 * São termos que o modelo erra com frequência: nomes de produto, siglas
 * soletradas e códigos de modelo. Tudo aqui é editável e removível pelo
 * usuário — e a remoção é lembrada, então um termo apagado não volta sozinho
 * numa versão futura (ver `loadGlossary`).
 *
 * Ao escolher variantes, o critério é: **a variante não pode ser uma palavra
 * legítima do idioma**. "voltar" como variante de Holter destruiria o verbo
 * "voltar"; "eletro" como variante de ECG destruiria uma palavra corrente em
 * português. Variante ambígua faz mais estrago do que o erro que ela conserta.
 *
 * Quando a variante colide com uma palavra comum, escreva-a **com maiúscula**:
 * variante com maiúscula casa com diferenciação de caixa. "Alterna" corrige o
 * nome que o modelo capitalizou por reconhecê-lo como nome próprio, e deixa o
 * verbo "alterna" em paz.
 */
export const DEFAULT_GLOSSARY: GlossaryEntry[] = [
  // Empresas
  // "card online" e "cardiolimne" saíram de testes reais, não de suposição.
  { id: "g_cardioline", term: "Cardioline", variants: ["cardio line", "cardiolaine", "cardio lane", "cardioláine", "cárdio line", "card online", "card on line", "cardio online", "cardiolimne", "cardiolini", "cardiolina", "carta online", "cardiolyne", "cardiolain",
    // "Cardiolipin" é termo real de bioquímica: só capitalizado.
    "Cardiolipin", "Cardiolipina"] },
  { id: "g_cardios", term: "Cardios", variants: ["cardius", "cárdios", "cardio's", "cardiós"] },

  // Produtos Cardioline
  { id: "g_vireo_ark", term: "Vireo ARK", variants: ["vireo arc", "vírio ark", "vírio arc", "vireoark", "vireo arca", "víreo ark", "vireo arque"] },
  { id: "g_ecgwebapp", term: "ECGWebApp", variants: ["ecg web app", "ecg webapp", "e c g web app", "ecgwebap"] },
  { id: "g_webapp", term: "WebApp", variants: ["web app", "uebapp", "uebi app", "web-app"] },
  { id: "g_touchecg", term: "touchECG", variants: ["touch ecg", "tach ecg", "tuch ecg", "touch e c g", "touchecg"] },
  { id: "g_clickecg", term: "ClickECG", variants: ["click ecg", "clique ecg", "clic ecg", "click e c g"] },
  { id: "g_clickholter", term: "Clickholter", variants: ["click holter", "clique holter", "clic holter", "click holder"] },
  { id: "g_cubestress", term: "CubeStress", variants: ["cube stress", "kiub stress", "cubi stress", "cub stress"] },
  { id: "g_cardiolight", term: "CardioLight", variants: ["cardio light", "cardiolaite", "cardio lait", "cárdio light"] },
  { id: "g_walk200", term: "Walk200", variants: ["walk 200", "uok 200", "uauk 200", "walk duzentos"] },
  { id: "g_walk400", term: "Walk400", variants: ["walk 400", "uok 400", "uauk 400", "walk quatrocentos"] },
  { id: "g_cardioline_research", term: "Cardioline Research", variants: ["cardio line research", "cardioline rissertch"] },

  // Modelos de eletrocardiógrafo. Códigos soletrados saem partidos quase sempre.
  { id: "g_ecg100s", term: "ECG100S", variants: ["ecg 100 s", "e c g 100 s", "ecg cem s", "ecg100 s"] },
  { id: "g_ecg100l", term: "ECG100L", variants: ["ecg 100 l", "e c g 100 l", "ecg cem l"] },
  { id: "g_ecg200s", term: "ECG200S", variants: ["ecg 200 s", "e c g 200 s", "ecg duzentos s"] },
  { id: "g_ecg200l", term: "ECG200L", variants: ["ecg 200 l", "e c g 200 l", "ecg duzentos l"] },
  { id: "g_ecg300g", term: "ECG300G", variants: ["ecg 300 g", "e c g 300 g", "ecg trezentos g"] },

  // Produtos Cardios
  { id: "g_wincardio", term: "WinCardio", variants: ["win cardio", "uin cardio", "wyn cardio", "win cárdio", "vin cardio"] },
  { id: "g_ergopc", term: "ErgoPC", variants: ["ergo pc", "ergo p c", "ergopê cê", "ergo pê cê"] },
  { id: "g_hdplus", term: "HD+", variants: ["hd mais", "h d mais", "agá dê mais", "hd plus", "h d plus"] },

  // Termos clínicos
  // "router", "hotter" e "roteador" apareceram em teste real com voz humana.
  // São palavras legítimas em outros contextos — ver a nota no README.
  // "router", "hotter" e "Alterna" saíram de testes reais. As capitalizadas
  // só casam capitalizadas — o modelo capitaliza o que entende como nome,
  // então o verbo "alterna" e o substantivo "alter" ficam intactos.
  // Holter é o caso difícil: o modelo o troca por uma palavra real diferente a
  // cada vez (Router, Hotter, Alterna, Oterno — todos de testes reais). As que
  // são palavras legítimas entram **capitalizadas**, e por isso só casam
  // capitalizadas: o modelo capitaliza o que entende como nome próprio, então
  // "o roteador da sala" e "o sistema alterna" ficam intactos.
  { id: "g_holter", term: "Holter", variants: [
    "rolter", "olter", "holte", "rólter", "ólter", "hólter", "houlter",
    "Holder", "Router", "Hotter", "Rooter", "Roteador", "Alterna", "Alter",
    "Ater", "Oter", "Oterno",
  ] },
  { id: "g_ecg", term: "ECG", variants: ["e c g", "e.c.g.", "e-c-g", "acg", "a c g", "ace ge", "ecgê"] },
  { id: "g_spirometria", term: "espirometria", variants: ["expirometria", "spirometria", "esperometria"] },

  // Negócio
  { id: "g_mrr", term: "MRR", variants: ["m r r", "eme erre erre", "emerre", "m. r. r."] },
  { id: "g_arr", term: "ARR", variants: ["a r r", "á erre erre", "a. r. r."] },
  { id: "g_cac", term: "CAC", variants: ["c a c", "cê a cê", "cak"] },
  { id: "g_ltv", term: "LTV", variants: ["l t v", "ele tê vê", "elletevê"] },
  { id: "g_icp", term: "ICP", variants: ["i c p", "i cê pê"] },
  { id: "g_saas", term: "SaaS", variants: ["saas", "sás", "sass", "s a a s"] },
  { id: "g_b2b", term: "B2B", variants: ["b two b", "bê dois bê", "b 2 b"] },
  { id: "g_crm", term: "CRM", variants: ["c r m", "cê erre eme"] },
  { id: "g_erp", term: "ERP", variants: ["e r p", "é erre pê"] },

  // Regulatório
  { id: "g_anvisa", term: "Anvisa", variants: ["anvisa", "an visa", "anvisá"] },
  { id: "g_lgpd", term: "LGPD", variants: ["l g p d", "ele gê pê dê", "lgpd"] },
  { id: "g_fda", term: "FDA", variants: ["f d a", "efe dê a", "éfe dê á"] },
  { id: "g_sus", term: "SUS", variants: ["s u s"] },
];

/* ------------------------------------------------------------------ */
/* Armazenamento                                                      */
/* ------------------------------------------------------------------ */

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((t) => t.toLowerCase()) : []);
  } catch {
    return new Set();
  }
}

/**
 * Lê o dicionário do usuário e completa com os termos padrão que ele ainda não
 * tem — exceto os que apagou de propósito.
 *
 * Isso resolve dois problemas de uma vez: quem já usava a ferramenta recebe os
 * termos novos de uma versão futura sem precisar fazer nada, e quem apagou
 * "Holter" não o vê ressuscitar toda vez que a lista padrão cresce.
 */
export function loadGlossary(): GlossaryEntry[] {
  if (typeof window === "undefined") return DEFAULT_GLOSSARY;

  let stored: GlossaryEntry[] | null = null;
  try {
    const raw = window.localStorage.getItem(GLOSSARY_KEY);
    stored = raw === null ? null : (JSON.parse(raw) as GlossaryEntry[]);
  } catch {
    stored = null;
  }
  if (!stored || !Array.isArray(stored)) return DEFAULT_GLOSSARY;

  const dismissed = readDismissed();
  const present = new Set(stored.map((entry) => entry.term.trim().toLowerCase()));
  const missing = DEFAULT_GLOSSARY.filter((entry) => {
    const key = entry.term.toLowerCase();
    return !present.has(key) && !dismissed.has(key);
  });

  return missing.length ? [...stored, ...missing] : stored;
}

/**
 * Grava no `localStorage` e mais lugar nenhum. Também registra quais termos
 * padrão sumiram da lista, para não reinseri-los depois.
 */
export function saveGlossary(entries: GlossaryEntry[]): void {
  if (typeof window === "undefined") return;

  const present = new Set(entries.map((entry) => entry.term.trim().toLowerCase()));
  const dismissed = DEFAULT_GLOSSARY.map((entry) => entry.term.toLowerCase()).filter(
    (term) => !present.has(term),
  );

  try {
    window.localStorage.setItem(GLOSSARY_KEY, JSON.stringify(entries));
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
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

function foldChar(char: string, caseSensitive = false): string {
  const lower = char.toLowerCase();
  const group = ACCENT_GROUPS[lower];
  if (!group) return escapeRegex(char);
  // Numa variante sensível à caixa, só as formas acentuadas da mesma caixa.
  if (caseSensitive) {
    return char === lower ? `[${group}]` : `[${group.toUpperCase()}]`;
  }
  return `[${group}${group.toUpperCase()}]`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Uma variante vira um padrão tolerante a acento e a espaçamento: "e c g"
 * também casa "e  c  g", e "cardio line" casa "cardio-line".
 */
function variantToPattern(variant: string, caseSensitive = false): string {
  return variant
    .trim()
    .split(/\s+/)
    .map((word) => [...word].map((char) => foldChar(char, caseSensitive)).join(""))
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

    /**
     * O próprio termo vira regra, para normalizar a caixa: "cardioline" e
     * "CardioLine" viram "Cardioline" sem precisar listar cada variação.
     *
     * Exceto quando a forma correta é toda minúscula — aí a regra
     * transformaria "Espirometria" no começo de uma frase em "espirometria",
     * quebrando a capitalização.
     */
    if (term !== term.toLowerCase()) {
      rules.push({
        pattern: new RegExp(
          `(?<![\\p{L}\\p{N}])${variantToPattern(term)}(?![\\p{L}\\p{N}])`,
          "giu",
        ),
        replacement: term,
      });
    }

    // Variantes mais longas primeiro: senão "ecg" consome o começo de "ecg-12".
    const variants = [...entry.variants]
      .map((variant) => variant.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    for (const variant of variants) {
      // Uma variante idêntica ao termo correto só geraria trabalho à toa.
      if (variant.toLowerCase() === term.toLowerCase()) continue;

      /**
       * Variante com maiúscula casa respeitando a caixa; variante toda
       * minúscula casa em qualquer caixa.
       *
       * É o que torna seguro corrigir um erro que também é palavra comum: o
       * modelo capitaliza o que entende como nome próprio, então "Alterna"
       * distingue o nome mal ouvido do verbo "alterna".
       */
      const caseSensitive = variant !== variant.toLowerCase();
      rules.push({
        // `\b` não funciona quando a variante começa ou termina em pontuação,
        // então usamos lookaround por caractere de palavra.
        pattern: new RegExp(
          `(?<![\\p{L}\\p{N}])${variantToPattern(variant, caseSensitive)}(?![\\p{L}\\p{N}])`,
          caseSensitive ? "gu" : "giu",
        ),
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
