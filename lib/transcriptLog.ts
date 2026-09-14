import { getLanguage } from "@/lib/languages";
import type { TargetLanguageCode } from "@/types/realtime";

/**
 * Histórico de transcrições no `localStorage` do próprio usuário.
 *
 * Nada disso sai do navegador: não há servidor, banco nem upload. O Route
 * Handler continua vendo só o pedido de client secret. O que mudou em relação
 * ao desenho original é que o transcript agora **sobrevive** ao fim da sessão,
 * no dispositivo de quem usou — e por isso a interface precisa deixar apagar,
 * sempre com confirmação.
 */

const SESSIONS_KEY = "live-translation:sessions";
const PREFERENCES_KEY = "live-translation:preferences";
/** Teto para não estourar a cota do localStorage numa maratona de reuniões. */
const MAX_SESSIONS = 40;

export interface SessionLog {
  id: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  /** Soma de minutos por idioma — a base do custo. */
  languageMinutes: number;
  languages: TargetLanguageCode[];
  /** Trechos fechados da língua de origem, em ordem. */
  source: string[];
  /** Trechos fechados por idioma de destino, em ordem. */
  translations: Partial<Record<TargetLanguageCode, string[]>>;
}

function readRaw<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSessions(): SessionLog[] {
  const sessions = readRaw<SessionLog[]>(SESSIONS_KEY, []);
  return Array.isArray(sessions)
    ? sessions.sort((a, b) => b.startedAt - a.startedAt)
    : [];
}

/**
 * Grava ou atualiza uma sessão. Se a cota estourar, descarta as mais antigas e
 * tenta de novo — perder histórico velho é melhor do que perder a reunião atual.
 */
export function saveSession(session: SessionLog): SessionLog[] {
  if (typeof window === "undefined") return [];

  const others = loadSessions().filter((item) => item.id !== session.id);
  let next = [session, ...others].slice(0, MAX_SESSIONS);

  for (;;) {
    try {
      window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
      return next;
    } catch {
      if (next.length <= 1) {
        // Nem a sessão atual cabe: desiste em silêncio em vez de quebrar a UI.
        return loadSessions();
      }
      next = next.slice(0, next.length - 1);
    }
  }
}

export function deleteSession(id: string): SessionLog[] {
  if (typeof window === "undefined") return [];
  const next = loadSessions().filter((session) => session.id !== id);
  window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
  return next;
}

export function clearSessions(): SessionLog[] {
  if (typeof window === "undefined") return [];
  window.localStorage.removeItem(SESSIONS_KEY);
  return [];
}

export function isSessionEmpty(session: SessionLog): boolean {
  return (
    session.source.length === 0 &&
    Object.values(session.translations).every((list) => !list?.length)
  );
}

/* ------------------------------------------------------------------ */
/* Exportação                                                         */
/* ------------------------------------------------------------------ */

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString("pt-BR");
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}min`;
  if (minutes > 0) return `${minutes}min ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function sessionToText(session: SessionLog): string {
  const lines: string[] = [
    `Tradução ao vivo — ${formatTimestamp(session.startedAt)}`,
    `Duração: ${formatDuration(session.durationMs)}`,
    `Idiomas: ${session.languages.map((code) => getLanguage(code).label).join(", ") || "—"}`,
    `Minutos-idioma: ${session.languageMinutes.toFixed(1)}`,
    "",
  ];

  if (session.source.length) {
    lines.push("## Original (detecção automática)", "", ...session.source, "");
  }

  for (const code of session.languages) {
    const segments = session.translations[code];
    if (!segments?.length) continue;
    lines.push(`## ${getLanguage(code).label}`, "", ...segments, "");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function sessionsToText(sessions: readonly SessionLog[]): string {
  return sessions.map(sessionToText).join("\n---\n\n");
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function sessionFilename(session: SessionLog): string {
  const date = new Date(session.startedAt);
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ];
  return `traducao-${stamp.slice(0, 3).join("-")}-${stamp.slice(3).join("h")}.txt`;
}

/* ------------------------------------------------------------------ */
/* Preferências de leitura                                            */
/* ------------------------------------------------------------------ */

export interface ReadingPreferences {
  fontId: string;
  /** Multiplicador aplicado sobre o tamanho base da legenda. */
  scale: number;
  arrangement: "auto" | "columns" | "rows" | "grid";
  /**
   * Tamanho da faixa de legendas por layout, em **porcentagem** do palco.
   *
   * Porcentagem e não pixels: o mesmo ajuste precisa valer no notebook e no
   * projetor, que têm resoluções diferentes. E um valor por layout porque a
   * faixa sobreposta costuma ser mais fina que a faixa de baixo.
   */
  bandSize: { bottom: number; top: number; right: number; overlay: number };
  /** Legendas em tela cheia, ou slides com as legendas numa faixa. */
  mode: "captions" | "presentation";
  /** Onde as legendas ficam em relação aos slides. */
  captionLayout: "bottom" | "top" | "right" | "overlay" | "hidden";
  theme: string;
  showOriginal: boolean;
}

export const DEFAULT_PREFERENCES: ReadingPreferences = {
  fontId: "inter",
  scale: 1,
  arrangement: "auto",
  bandSize: { bottom: 30, top: 30, right: 32, overlay: 26 },
  mode: "captions",
  captionLayout: "bottom",
  theme: "light",
  showOriginal: true,
};

export function loadPreferences(): ReadingPreferences {
  const stored = readRaw<Partial<ReadingPreferences>>(PREFERENCES_KEY, {});
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    // `bandSize` é objeto: espalhar por cima perderia as chaves que uma
    // versão anterior ainda não gravava.
    bandSize: { ...DEFAULT_PREFERENCES.bandSize, ...(stored.bandSize ?? {}) },
  };
}

export function savePreferences(preferences: ReadingPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    /* cota cheia: preferência é o que menos importa perder */
  }
}
