import { readApiKey } from "@/lib/apiKey";
import { isTargetLanguageCode } from "@/lib/languages";
import type {
  ClientSecretResponse,
  SessionError,
  SessionErrorKind,
  TargetLanguageCode,
} from "@/types/realtime";

/**
 * Cria o client secret efêmero de uma sessão de tradução.
 *
 * Há dois caminhos, e qual deles roda depende de onde a chave está:
 *
 * - **Chave do usuário** (localStorage): o navegador chama a OpenAI direto.
 *   É o único caminho possível na versão estática do GitHub Pages, onde não
 *   existe servidor. Verificado: o endpoint de client secrets responde com CORS
 *   aberto, então isso funciona de qualquer origem.
 * - **Sem chave do usuário**: chama o Route Handler desta aplicação, que usa a
 *   `OPENAI_API_KEY` do servidor. Só existe na build completa.
 *
 * Nos dois casos o que chega ao WebRTC é o mesmo segredo de curta duração.
 */

const CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/translations/client_secrets";

export const MODEL = "gpt-realtime-translate";

/**
 * Modelo de transcrição da língua de origem. Sem ele o servidor não emite
 * `session.input_transcript.delta`.
 */
const INPUT_TRANSCRIPTION_MODEL = "gpt-realtime-whisper";

/** `far_field` é o modo para microfone de notebook ou de sala de reunião. */
const NOISE_REDUCTION = { type: "far_field" as const };

const SAFETY_IDENTIFIER_STORAGE = "live-translation:safety-id";

export class ClientSecretError extends Error {
  constructor(readonly detail: SessionError, readonly retryable: boolean) {
    super(detail.message);
    this.name = "ClientSecretError";
  }
}

/**
 * Identificador anônimo e estável por navegador, só para o header
 * `OpenAI-Safety-Identifier`. Nunca deriva de e-mail ou dado pessoal.
 */
function safetyIdentifier(): string {
  if (typeof window === "undefined") return "anonymous";
  let value = window.localStorage.getItem(SAFETY_IDENTIFIER_STORAGE);
  if (!value) {
    value = crypto.randomUUID().replace(/-/g, "");
    window.localStorage.setItem(SAFETY_IDENTIFIER_STORAGE, value);
  }
  return value;
}

export function sessionBody(language: TargetLanguageCode) {
  return {
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
  };
}

export function classifyHttpError(status: number, body: string): SessionError {
  if (status === 401 || status === 403) {
    return {
      kind: "auth",
      message:
        "Credencial recusada pela OpenAI. Confira a chave em Configurar — ou o saldo da conta.",
    };
  }
  if (status === 429) {
    /**
     * Saldo zerado e limite de taxa chegam os dois como 429, e mandam para
     * lados opostos: um se resolve esperando, o outro nunca. Dizer "reduza o
     * número de idiomas" para quem está sem crédito manda a pessoa mexer no
     * lugar errado — e o app fica reconectando contra uma parede.
     */
    if (/insufficient_quota|no credits|exceeded your current quota/i.test(body)) {
      return {
        kind: "no-credits",
        message:
          "A conta da OpenAI está sem créditos. Adicione saldo em platform.openai.com → Billing.",
      };
    }
    return {
      kind: "rate-limit",
      message:
        "Limite de uso atingido. Reduza o número de idiomas simultâneos ou aguarde.",
    };
  }
  if (status === 404) {
    return {
      kind: "auth",
      message:
        "Esta versão não tem servidor próprio. Abra Configurar e informe a sua chave da OpenAI.",
    };
  }
  if (status >= 500) {
    return { kind: "api-unavailable", message: "A API da OpenAI está indisponível." };
  }
  if (status === 400 && /language/i.test(body)) {
    return {
      kind: "unsupported-language",
      message: "Idioma de saída não suportado pela API.",
    };
  }
  return {
    kind: "unknown",
    message: body.slice(0, 300) || `Erro HTTP ${status}.`,
  };
}

/**
 * Vale a pena tentar de novo?
 *
 * Uma regra só, usada nos três lugares que falham — criar o segredo pelo
 * servidor, criar direto na OpenAI e abrir a call de SDP. Antes cada um decidia
 * do seu jeito: o do SDP olhava o status HTTP cru, então um 429 por falta de
 * crédito virava cinco tentativas de reconexão contra uma parede.
 */
export function isRetryable(kind: SessionErrorKind): boolean {
  return kind === "api-unavailable" || kind === "rate-limit";
}

interface MintOptions {
  targetLanguage: TargetLanguageCode;
  /** Sobrescreve a chave salva — usado pelo "Testar" antes de salvar. */
  apiKey?: string | null;
  tokenEndpoint?: string;
}

export async function mintClientSecret({
  targetLanguage,
  apiKey,
  tokenEndpoint = "/api/realtime/token",
}: MintOptions): Promise<ClientSecretResponse> {
  if (!isTargetLanguageCode(targetLanguage)) {
    throw new ClientSecretError(
      {
        kind: "unsupported-language",
        message: "Idioma de saída não suportado por gpt-realtime-translate.",
      },
      false,
    );
  }

  const key = apiKey ?? readApiKey();
  return key
    ? mintDirect(targetLanguage, key)
    : mintViaServer(targetLanguage, tokenEndpoint);
}

async function mintDirect(
  targetLanguage: TargetLanguageCode,
  apiKey: string,
): Promise<ClientSecretResponse> {
  let response: Response;
  try {
    response = await fetch(CLIENT_SECRET_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier(),
      },
      body: JSON.stringify(sessionBody(targetLanguage)),
    });
  } catch (error) {
    throw new ClientSecretError(
      {
        kind: "api-unavailable",
        message: `Não foi possível alcançar a OpenAI: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      true,
    );
  }

  const raw = await response.text();
  if (!response.ok) {
    const detail = classifyHttpError(response.status, raw);
    throw new ClientSecretError(detail, isRetryable(detail.kind));
  }

  let data: { value?: unknown; expires_at?: unknown };
  try {
    data = JSON.parse(raw) as { value?: unknown; expires_at?: unknown };
  } catch {
    throw new ClientSecretError(
      { kind: "api-unavailable", message: "Resposta inesperada da OpenAI." },
      true,
    );
  }

  if (typeof data.value !== "string") {
    throw new ClientSecretError(
      { kind: "api-unavailable", message: "A OpenAI não devolveu um client secret." },
      true,
    );
  }

  return {
    value: data.value,
    expiresAt: typeof data.expires_at === "number" ? data.expires_at : null,
    targetLanguage,
    model: MODEL,
  };
}

async function mintViaServer(
  targetLanguage: TargetLanguageCode,
  endpoint: string,
): Promise<ClientSecretResponse> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage }),
    });
  } catch (error) {
    throw new ClientSecretError(
      {
        kind: "api-unavailable",
        message: `Não foi possível falar com o servidor: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      true,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | (ClientSecretResponse & { error?: string; kind?: SessionError["kind"] })
    | null;

  if (!response.ok || !payload?.value) {
    const kind = payload?.kind ?? classifyHttpError(response.status, "").kind;
    throw new ClientSecretError(
      {
        kind,
        message:
          payload?.error ?? classifyHttpError(response.status, "").message,
      },
      isRetryable(kind),
    );
  }

  return payload;
}
