import type { TargetLanguageCode } from "@/types/realtime";

/**
 * Os 13 idiomas de SAÍDA suportados hoje por `gpt-realtime-translate`.
 *
 * Fonte: cookbook oficial ("Realtime Translation currently supports 13 target
 * output languages") e a constante SUPPORTED_TRANSLATION_LANGUAGES do demo
 * oficial em openai/openai-cookbook →
 * examples/voice_solutions/realtime_translation_guide/browser-translation-demo/src/session.js
 *
 * Não adicionar códigos sem conferir a documentação: a API rejeita o resto.
 */
export const TARGET_LANGUAGES: ReadonlyArray<{
  code: TargetLanguageCode;
  label: string;
  /** Nome no próprio idioma, usado no cabeçalho da legenda. */
  native: string;
  /** BCP-47 para o atributo `lang` do HTML (hifenização/tipografia corretas). */
  htmlLang: string;
}> = [
  { code: "pt", label: "Português", native: "PORTUGUÊS", htmlLang: "pt" },
  { code: "en", label: "Inglês", native: "ENGLISH", htmlLang: "en" },
  { code: "es", label: "Espanhol", native: "ESPAÑOL", htmlLang: "es" },
  { code: "it", label: "Italiano", native: "ITALIANO", htmlLang: "it" },
  { code: "fr", label: "Francês", native: "FRANÇAIS", htmlLang: "fr" },
  { code: "de", label: "Alemão", native: "DEUTSCH", htmlLang: "de" },
  { code: "ru", label: "Russo", native: "РУССКИЙ", htmlLang: "ru" },
  { code: "zh", label: "Chinês", native: "中文", htmlLang: "zh" },
  { code: "ja", label: "Japonês", native: "日本語", htmlLang: "ja" },
  { code: "ko", label: "Coreano", native: "한국어", htmlLang: "ko" },
  { code: "hi", label: "Híndi", native: "हिन्दी", htmlLang: "hi" },
  { code: "id", label: "Indonésio", native: "INDONESIA", htmlLang: "id" },
  { code: "vi", label: "Vietnamita", native: "TIẾNG VIỆT", htmlLang: "vi" },
];

const BY_CODE = new Map(TARGET_LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: TargetLanguageCode) {
  const language = BY_CODE.get(code);
  if (!language) throw new Error(`Idioma de saída não suportado: ${code}`);
  return language;
}

/** Mesmo regex do demo oficial, aplicado antes da checagem de lista. */
const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/;

export function isTargetLanguageCode(
  value: unknown,
): value is TargetLanguageCode {
  return (
    typeof value === "string" &&
    LANGUAGE_TAG_PATTERN.test(value) &&
    BY_CODE.has(value as TargetLanguageCode)
  );
}

/**
 * Não existe seletor de idioma de entrada nesta aplicação, e isso é uma
 * decisão apoiada em teste, não em leitura.
 *
 * `gpt-realtime-translate` detecta o idioma de origem sozinho (70+ idiomas) e
 * a API **rejeita** qualquer tentativa de fixá-lo. Verificado contra a API real
 * em 2026-09-12: tanto `session.audio.input.transcription.language` quanto
 * `session.audio.input.language` respondem
 * `400 unknown_parameter` — a mesma resposta que um campo inventado recebe. O
 * campo `language` que aparece no *exemplo* de `session.created` na referência
 * não existe no schema.
 *
 * Ver docs/openai-realtime-translation.md §6.2.
 */
export const SOURCE_LANGUAGE_MODE = "auto" as const;
