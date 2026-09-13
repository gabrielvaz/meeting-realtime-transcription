/**
 * Chave da OpenAI fornecida pelo próprio usuário, guardada no `localStorage`.
 *
 * A arquitetura não muda: a chave vai para o Route Handler da mesma origem,
 * que a usa apenas para criar o client secret efêmero. O navegador continua
 * nunca falando direto com a `api.openai.com` usando credencial permanente, e
 * o servidor continua não persistindo nada.
 *
 * O que muda é o risco: uma chave no `localStorage` é legível por qualquer
 * script que rode nesta página. Isso é aceitável para uso local ou numa
 * instância que só você acessa; não é para um site público multiusuário. A
 * interface diz isso em voz alta no modal de configuração.
 */

const API_KEY_STORAGE = "live-translation:openai-key";

export function readApiKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(API_KEY_STORAGE);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writeApiKey(value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(API_KEY_STORAGE, value.trim());
}

export function clearApiKey(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(API_KEY_STORAGE);
}

/** Mostra só o suficiente para o usuário reconhecer qual chave está salva. */
export function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 12) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`;
}

/** Checagem de forma, só para pegar colagem errada antes de gastar uma ida à API. */
export function looksLikeApiKey(value: string): boolean {
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(value.trim());
}
