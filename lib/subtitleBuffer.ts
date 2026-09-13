/**
 * Acumula os deltas de transcript num estado de legenda coerente.
 *
 * Duas regras da documentação moldam esta classe
 * (docs/openai-realtime-translation.md §5.2):
 *
 * 1. "Transcript deltas are append-only text fragments. Clients should not
 *    insert unconditional spaces between deltas." → concatenação crua, sempre.
 * 2. A API **não** emite evento de fim de trecho para transcript. O único
 *    evento terminal é `session.closed`. Logo o fatiamento em frases é
 *    responsabilidade do cliente.
 *
 * O corte acontece por pontuação final (com tamanho mínimo, para não picotar em
 * abreviações curtas), por tamanho máximo, ou por silêncio. Nada é descartado:
 * a tela rola, o texto antigo continua lá.
 */

const SENTENCE_END = /[.!?…。！？]["'”’)\]]?\s*$/;
const MIN_SEGMENT_CHARS = 16;
const MAX_SEGMENT_CHARS = 260;
const IDLE_FLUSH_MS = 2200;

export interface SubtitleSnapshot {
  /** Trechos já fechados, do mais antigo para o mais novo. */
  segments: readonly string[];
  /** Trecho sendo falado agora. */
  current: string;
  /** Incrementa a cada mudança; serve de chave de re-render. */
  revision: number;
}

const EMPTY: SubtitleSnapshot = { segments: [], current: "", revision: 0 };

export class SubtitleBuffer {
  /** Chamado a cada trecho fechado — alimenta o histórico persistido. */
  #onSegmentClosed?: (segment: string) => void;
  #current = "";
  #segments: string[] = [];
  #lastDeltaAt = 0;
  #revision = 0;
  #snapshot: SubtitleSnapshot = EMPTY;
  #dirty = false;

  constructor(onSegmentClosed?: (segment: string) => void) {
    this.#onSegmentClosed = onSegmentClosed;
  }

  /** Concatena um delta. Retorna `true` se o snapshot mudou. */
  append(delta: string, now: number = Date.now()): boolean {
    if (!delta) return false;
    this.#current += delta;
    this.#lastDeltaAt = now;
    this.#dirty = true;

    const trimmed = this.#current.trim();
    if (trimmed.length >= MIN_SEGMENT_CHARS && SENTENCE_END.test(this.#current)) {
      this.#closeSegment();
    } else if (trimmed.length > MAX_SEGMENT_CHARS) {
      this.#closeSegmentAtLastSpace();
    }

    this.#bump();
    return true;
  }

  /** Fecha o trecho atual se houve silêncio prolongado. */
  flushIdle(now: number = Date.now()): boolean {
    if (!this.#current.trim()) return false;
    if (now - this.#lastDeltaAt < IDLE_FLUSH_MS) return false;
    this.#closeSegment();
    this.#bump();
    return true;
  }

  /** Fecha o trecho pendente — usado ao pausar ou encerrar. */
  finalize(): boolean {
    if (!this.#current.trim()) return false;
    this.#closeSegment();
    this.#bump();
    return true;
  }

  reset(): void {
    this.#current = "";
    this.#segments = [];
    this.#lastDeltaAt = 0;
    this.#revision = 0;
    this.#snapshot = EMPTY;
    this.#dirty = false;
  }

  snapshot(): SubtitleSnapshot {
    if (this.#dirty) {
      this.#snapshot = {
        segments: this.#segments,
        current: this.#current.trimStart(),
        revision: this.#revision,
      };
      this.#dirty = false;
    }
    return this.#snapshot;
  }

  #closeSegment(): void {
    const segment = this.#current.trim();
    this.#current = "";
    if (!segment) return;
    // Cópia nova a cada fechamento: o React compara por referência.
    this.#segments = [...this.#segments, segment];
    this.#onSegmentClosed?.(segment);
  }

  #closeSegmentAtLastSpace(): void {
    const breakAt = this.#current.lastIndexOf(" ", MAX_SEGMENT_CHARS);
    if (breakAt <= 0) {
      this.#closeSegment();
      return;
    }
    const head = this.#current.slice(0, breakAt).trim();
    const tail = this.#current.slice(breakAt);
    this.#current = head;
    this.#closeSegment();
    this.#current = tail.trimStart();
  }

  #bump(): void {
    this.#revision += 1;
    this.#dirty = true;
  }
}
