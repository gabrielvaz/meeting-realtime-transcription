import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { isTargetLanguageCode } from "@/lib/languages";
import {
  MODEL,
  classifyHttpError,
  sessionBody,
} from "@/lib/openai/clientSecret";
import type { TargetLanguageCode } from "@/types/realtime";

/**
 * Cria o client secret efêmero usando a chave do **servidor**.
 *
 * Este caminho existe para quem não quer a chave no navegador: defina
 * `OPENAI_API_KEY` no `.env.local` e a interface passa a usar esta rota. Quando
 * o usuário configura a própria chave, o navegador fala direto com a OpenAI e
 * esta rota não é chamada — ver `lib/openai/clientSecret.ts`.
 *
 * O sufixo `.server.ts` no nome do arquivo não é decorativo: é ele que tira
 * esta rota do export estático do GitHub Pages, via `pageExtensions` em
 * `next.config.ts`. Lá não existe servidor, e portanto não existe este caminho.
 *
 * A chave nunca é persistida, logada nem devolvida. O browser recebe apenas
 * `{ value, expiresAt }` — o segredo de curta duração usado como Bearer no POST
 * do SDP para `/v1/realtime/translations/calls`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/translations/client_secrets";

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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Nenhuma chave da OpenAI no servidor. Abra Configurar e informe a sua.",
        kind: "auth",
      },
      { status: 401 },
    );
  }

  let targetLanguage: unknown;
  try {
    ({ targetLanguage } = (await request.json()) as { targetLanguage?: unknown });
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido.", kind: "unknown" },
      { status: 400 },
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
      body: JSON.stringify(sessionBody(language)),
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
      { error: "A OpenAI não devolveu um client secret.", kind: "api-unavailable" },
      { status: 502 },
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
