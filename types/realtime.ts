/**
 * Tipos da Realtime Translation API da OpenAI.
 *
 * Os nomes de evento abaixo são exatamente os documentados em
 * https://developers.openai.com/api/reference/resources/realtime/translation-server-events
 * e .../translation-client-events — ver docs/openai-realtime-translation.md §5.
 */

/** Códigos de idioma de SAÍDA aceitos por `gpt-realtime-translate` (13). */
export type TargetLanguageCode =
  | "es"
  | "pt"
  | "fr"
  | "ja"
  | "ru"
  | "zh"
  | "de"
  | "ko"
  | "hi"
  | "id"
  | "vi"
  | "it"
  | "en";

/** Resposta normalizada do nosso Route Handler (nunca a chave permanente). */
export interface ClientSecretResponse {
  value: string;
  expiresAt: number | null;
  targetLanguage: TargetLanguageCode;
  model: string;
}

/** Estados possíveis de uma sessão de tradução. */
export type SessionStatus =
  | "idle"
  | "requesting-token"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

/** Categorias de erro que a interface precisa distinguir. */
export type SessionErrorKind =
  | "auth"
  | "no-credits"
  | "rate-limit"
  | "api-unavailable"
  | "connection-lost"
  | "unsupported-language"
  | "unknown";

export interface SessionError {
  kind: SessionErrorKind;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Eventos do servidor (chegam pelo data channel `oai-events`)         */
/* ------------------------------------------------------------------ */

export interface TranslationSessionCreatedEvent {
  type: "session.created";
  event_id: string;
  session: {
    id: string;
    type: "translation";
    model: string;
    expires_at: number;
    audio?: {
      input?: {
        transcription?: { model: string } | null;
        noise_reduction?: { type: "near_field" | "far_field" } | null;
      };
      output?: { language?: string };
    };
  };
}

export interface TranslationSessionUpdatedEvent {
  type: "session.updated";
  event_id: string;
  session: TranslationSessionCreatedEvent["session"];
}

export interface TranslationSessionClosedEvent {
  type: "session.closed";
  event_id: string;
}

export interface TranslationTranscriptDeltaEvent {
  type: "session.input_transcript.delta" | "session.output_transcript.delta";
  event_id: string;
  delta: string;
  /** Metadado de alinhamento em passos de 200 ms. NÃO é identificador único. */
  elapsed_ms?: number | null;
}

export interface TranslationOutputAudioDeltaEvent {
  type: "session.output_audio.delta";
  event_id: string;
  delta: string;
  sample_rate?: number;
  channels?: number;
  format?: "pcm16";
  elapsed_ms?: number | null;
}

export interface TranslationErrorEvent {
  type: "error";
  event_id: string;
  error: {
    message: string;
    type: string;
    code?: string | null;
    param?: string | null;
    event_id?: string | null;
  };
}

export type TranslationServerEvent =
  | TranslationSessionCreatedEvent
  | TranslationSessionUpdatedEvent
  | TranslationSessionClosedEvent
  | TranslationTranscriptDeltaEvent
  | TranslationOutputAudioDeltaEvent
  | TranslationErrorEvent
  | { type: string; [key: string]: unknown };
