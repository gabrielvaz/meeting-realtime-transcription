/**
 * Medição local de uso, para estimar custo depois.
 *
 * `gpt-realtime-translate` é cobrado por minuto de áudio e cada idioma de saída
 * é uma sessão própria. A métrica que importa, portanto, é
 * "translation-language-minutes": 10 min de reunião com 2 idiomas ≈ 20.
 *
 * Pausa conta como tempo parado, não como tempo traduzindo: ao pausar as
 * sessões são fechadas e nada mais é cobrado.
 *
 * Nada disso é enviado a lugar nenhum — vive na memória da aba e, ao encerrar,
 * vai para o histórico no `localStorage` do próprio usuário.
 */
export class UsageMeter {
  /** Idiomas abertos agora → instante em que abriram. */
  #open = new Map<string, number>();
  /** Minutos-idioma já fechados. */
  #languageMs = 0;
  /** Tempo de sessão já acumulado (fora dos períodos pausados). */
  #elapsedMs = 0;
  /** Instante em que o trecho ativo começou, ou null se pausado/parado. */
  #runningSince: number | null = null;

  start(now: number = Date.now()): void {
    this.#languageMs = 0;
    this.#elapsedMs = 0;
    this.#open.clear();
    this.#runningSince = now;
  }

  openLanguage(language: string, now: number = Date.now()): void {
    if (this.#open.has(language)) return;
    this.#open.set(language, now);
  }

  closeLanguage(language: string, now: number = Date.now()): void {
    const openedAt = this.#open.get(language);
    if (openedAt === undefined) return;
    this.#languageMs += now - openedAt;
    this.#open.delete(language);
  }

  /** Fecha todos os idiomas e congela o relógio da sessão. */
  pause(now: number = Date.now()): void {
    for (const language of [...this.#open.keys()]) this.closeLanguage(language, now);
    if (this.#runningSince !== null) {
      this.#elapsedMs += now - this.#runningSince;
      this.#runningSince = null;
    }
  }

  resume(now: number = Date.now()): void {
    if (this.#runningSince === null) this.#runningSince = now;
  }

  stop(now: number = Date.now()): void {
    this.pause(now);
  }

  reset(): void {
    this.#open.clear();
    this.#languageMs = 0;
    this.#elapsedMs = 0;
    this.#runningSince = null;
  }

  /** Duração efetiva da tradução, em segundos, sem contar o tempo pausado. */
  elapsedSeconds(now: number = Date.now()): number {
    return Math.floor(this.elapsedMs(now) / 1000);
  }

  elapsedMs(now: number = Date.now()): number {
    const running = this.#runningSince === null ? 0 : now - this.#runningSince;
    return this.#elapsedMs + running;
  }

  /** Soma de minutos por idioma — a base do custo. */
  languageMinutes(now: number = Date.now()): number {
    let total = this.#languageMs;
    for (const openedAt of this.#open.values()) total += now - openedAt;
    return total / 60_000;
  }

  activeLanguages(): number {
    return this.#open.size;
  }
}

export function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
