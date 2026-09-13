import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { isTargetLanguageCode } from "@/lib/languages";
import { classifyHttpError } from "@/lib/openai/realtimeTranslation";
import type { TargetLanguageCode } from "@/types/realtime";

/**
 * Cria o client secret efêmero de uma sessão de Realtime Translation.
 *
 * A chave permanente só existe aqui: ou vem de `OPENAI_API_KEY` no servidor,
 * ou é enviada pelo próprio usuário (guardada no `localStorage` do navegador
 * dele). Em nenhum dos casos ela é persistida, logada ou devolvida. O browser
 * recebe apenas `{ value, expiresAt }` — o segredo de curta duração usado como
 * Bearer no POST do SDP para `/v1/realtime/translations/calls`.
 *
 * Fonte: docs/openai-realtime-translation.md §3.1 e §9.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/translations/client_secrets";

const MODEL = "gpt-realtime-translate";

/**
 * Modelo de transcrição da língua de origem. Sem ele o servidor não emite
 * `session.input_transcript.delta` (e a opção "mostrar transcrição original"
 * fica vazia).
 */
const INPUT_TRANSCRIPTION_MODEL = "gpt-realtime-whisper";

/**
 * `far_field` é o modo para microfone de notebook ou de sala de reunião, que é
 * o cenário-alvo desta aplicação. `near_field` seria para headset.
 */
const NOISE_REDUCTION = { type: "far_field" as const };

/**
 * Identificador anônimo e estável por processo, só para o header
 * `OpenAI-Safety-Identifier`. Nunca deriva de e-mail ou dado pessoal.
 */
const SAFETY_IDENTIFIER = createHash("sha256")
  .update(randomUUID())
  .digest("hex")
  .slice(0, 32);

/**
 * Diz apenas se o servidor tem uma chave própria configurada, para a interface
 * saber se precisa pedir a do usuário. Não expõe a chave nem a toca.
 */
export async function GET() {
  return NextResponse.json(
    { serverKey: Boolean(process.env.OPENAI_API_KEY) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let targetLanguage: unknown;
  let providedKey: unknown;
  let verifyOnly = false;
  try {
    const body = (await request.json()) as {
      targetLanguage?: unknown;
      apiKey?: unknown;
      verifyOnly?: unknown;
    };
    targetLanguage = body.targetLanguage;
    providedKey = body.apiKey;
    verifyOnly = body.verifyOnly === true;
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido.", kind: "unknown" },
      { status: 400 },
    );
  }

  // A chave do usuário tem precedência: se ele configurou uma, é a dele que
  // deve ser cobrada, mesmo que o servidor também tenha uma.
  const apiKey =
    (typeof providedKey === "string" && providedKey.trim()) ||
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Nenhuma chave da OpenAI configurada. Abra Configurar e informe a sua, ou crie um .env.local no servidor.",
        kind: "auth",
      },
      { status: 401 },
    );
  }

  // Validação no servidor para o endpoint não virar um proxy aberto — mesma
  // proteção do demo oficial da OpenAI.
  if (!isTargetLanguageCode(targetLanguage)) {
    return NextResponse.json(
      {
        error:
          "Idioma de saída não suportado. Use um dos 13 códigos aceitos por gpt-realtime-translate.",
        kind: "unsupported-language",
      },
      { status: 400 },
    );
  }

  const language: TargetLanguageCode = targetLanguage;

  let upstream: Response;
  try {
    upstream = await fetch(CLIENT_SECRET_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": SAFETY_IDENTIFIER,
      },
      body: JSON.stringify({
        session: {
          model: MODEL,
          audio: {
            input: {
              transcription: { model: INPUT_TRANSCRIPTION_MODEL },
              noise_reduction: NOISE_REDUCTION,
            },
            output: { language },
          },
        },
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Não foi possível alcançar a API da OpenAI: ${
          error instanceof Error ? error.message : String(error)
        }`,
        kind: "api-unavailable",
      },
      { status: 502 },
    );
  }

  const rawBody = await upstream.text();

  if (!upstream.ok) {
    const detail = classifyHttpError(upstream.status, rawBody);
    // Log sem segredo: só status e idioma.
    console.error(
      `[realtime/token] OpenAI respondeu ${upstream.status} para "${language}"`,
    );
    return NextResponse.json(
      { error: detail.message, kind: detail.kind },
      { status: upstream.status },
    );
  }

  let data: { value?: unknown; expires_at?: unknown } | null = null;
  try {
    data = JSON.parse(rawBody) as { value?: unknown; expires_at?: unknown };
  } catch {
    data = null;
  }

  if (!data || typeof data.value !== "string") {
    return NextResponse.json(
      {
        error: "A OpenAI não devolveu um client secret.",
        kind: "api-unavailable",
      },
      { status: 502 },
    );
  }

  // "Testar chave" só precisa saber que o segredo foi criado; devolver o
  // valor seria expor uma credencial sem motivo.
  if (verifyOnly) {
    return NextResponse.json(
      { ok: true, model: MODEL },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      value: data.value,
      expiresAt: typeof data.expires_at === "number" ? data.expires_at : null,
      targetLanguage: language,
      model: MODEL,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
