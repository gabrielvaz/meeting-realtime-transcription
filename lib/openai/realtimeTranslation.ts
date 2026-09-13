import { readApiKey } from "@/lib/apiKey";
import type {
  ClientSecretResponse,
  SessionError,
  SessionStatus,
  TargetLanguageCode,
  TranslationServerEvent,
} from "@/types/realtime";

/**
 * Endpoint de call WebRTC da Realtime Translation API.
 * Atenção: NÃO é `/v1/realtime/calls` (essa é a de voice agent).
 * Fonte: docs/openai-realtime-translation.md §3.3
 */
const TRANSLATION_CALL_URL =
  "https://api.openai.com/v1/realtime/translations/calls";

/** Nome exigido pela OpenAI para o data channel de eventos. */
const EVENTS_CHANNEL = "oai-events";

/** Backoff de reconexão, em ms. O tamanho do array é o máximo de tentativas. */
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

/** `disconnected` costuma ser transitório: o ICE pode se recuperar sozinho. */
const DISCONNECTED_GRACE_MS = 4_000;

export interface TranslationSessionDiagnostics {
  targetLanguage: TargetLanguageCode;
  sessionId: string | null;
  connectionState: RTCPeerConnectionState | "new";
  dataChannelState: RTCDataChannelState | "none";
  /** ms entre o clique em Iniciar e o `connected` da peer connection. */
  connectMs: number | null;
  /** ms até o primeiro `session.output_transcript.delta`. */
  firstTranscriptMs: number | null;
  /** ms até a primeira remote audio track. */
  firstAudioMs: number | null;
  reconnects: number;
  expiresAt: number | null;
}

export interface TranslationSessionCallbacks {
  onStatus(status: SessionStatus, error?: SessionError): void;
  onOutputDelta(delta: string): void;
  onInputDelta(delta: string): void;
  onDiagnostics(diagnostics: TranslationSessionDiagnostics): void;
}

export interface TranslationSessionOptions extends TranslationSessionCallbacks {
  targetLanguage: TargetLanguageCode;
  /**
   * Stream compartilhado — o microfone é capturado UMA vez pela aplicação.
   * Passamos o MediaStream inteiro (e não só a track) porque `addTrack` precisa
   * dele para escrever o msid no SDP, como faz o demo oficial da OpenAI.
   */
  getStream: () => MediaStream | null;
  /** Começa audível? Por padrão só um idioma começa com som. */
  audible: boolean;
  volume: number;
  tokenEndpoint?: string;
}

/**
 * Uma sessão de tradução = um idioma de saída.
 *
 * A OpenAI orienta "use one session per output language", então cada instância
 * desta classe é dona de uma `RTCPeerConnection`, um data channel, um elemento
 * de áudio e seu próprio ciclo de reconexão.
 */
export class TranslationSession {
  readonly targetLanguage: TargetLanguageCode;

  #options: TranslationSessionOptions;
  #pc: RTCPeerConnection | null = null;
  #dc: RTCDataChannel | null = null;
  #sender: RTCRtpSender | null = null;
  #audio: HTMLAudioElement | null = null;

  #status: SessionStatus = "idle";
  #disposed = false;
  /** Invalida callbacks de tentativas antigas de conexão. */
  #generation = 0;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #disconnectedTimer: ReturnType<typeof setTimeout> | null = null;

  #muted: boolean;
  #volume: number;

  #diagnostics: TranslationSessionDiagnostics;
  #connectStartedAt = 0;

  constructor(options: TranslationSessionOptions) {
    this.#options = options;
    this.targetLanguage = options.targetLanguage;
    this.#muted = !options.audible;
    this.#volume = options.volume;
    this.#diagnostics = {
      targetLanguage: options.targetLanguage,
      sessionId: null,
      connectionState: "new",
      dataChannelState: "none",
      connectMs: null,
      firstTranscriptMs: null,
      firstAudioMs: null,
      reconnects: 0,
      expiresAt: null,
    };
  }

  get status(): SessionStatus {
    return this.#status;
  }

  get diagnostics(): TranslationSessionDiagnostics {
    return { ...this.#diagnostics };
  }

  /* ---------------------------------------------------------------- */
  /* Ciclo de vida                                                    */
  /* ---------------------------------------------------------------- */

  async start(): Promise<void> {
    if (this.#disposed) return;
    await this.#connect(false);
  }

  async #connect(isReconnect: boolean): Promise<void> {
    if (this.#disposed) return;

    const generation = ++this.#generation;
    this.#teardownConnection();
    this.#connectStartedAt = performance.now();
    this.#setStatus(isReconnect ? "reconnecting" : "requesting-token");

    try {
      const secret = await this.#requestClientSecret();
      if (this.#isStale(generation)) return;

      this.#setStatus(isReconnect ? "reconnecting" : "connecting");
      this.#diagnostics.expiresAt = secret.expiresAt;

      const stream = this.#options.getStream();
      const track = stream?.getAudioTracks()[0];
      if (!stream || !track) {
        throw new SessionFailure(
          { kind: "unknown", message: "Nenhuma fonte de áudio disponível." },
          false,
        );
      }

      const pc = new RTCPeerConnection();
      this.#pc = pc;
      this.#attachPeerHandlers(pc, generation);

      const dc = pc.createDataChannel(EVENTS_CHANNEL);
      this.#dc = dc;
      this.#attachDataChannelHandlers(dc, generation);

      this.#sender = pc.addTrack(track, stream);
      this.#ensureAudioElement();

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.#isStale(generation)) return;

      const sdpResponse = await fetch(TRANSLATION_CALL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret.value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });

      const answerSdp = await sdpResponse.text();
      if (this.#isStale(generation)) return;

      if (!sdpResponse.ok) {
        throw new SessionFailure(
          classifyHttpError(sdpResponse.status, answerSdp),
          sdpResponse.status >= 500 || sdpResponse.status === 429,
        );
      }

      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      if (this.#isStale(generation)) return;

      this.#log("sdp.answer", "aceita");
    } catch (error) {
      if (this.#isStale(generation)) return;
      this.#handleFailure(error);
    }
  }

  /** Fecha tudo o que esta sessão abriu. Idempotente. */
  cleanup(): void {
    this.#disposed = true;
    this.#generation += 1;
    this.#clearTimers();
    this.#teardownConnection();
    this.#setStatus("closed");
    this.#log("cleanup", "sessão encerrada");
  }

  #teardownConnection(): void {
    if (this.#dc) {
      this.#dc.onopen = null;
      this.#dc.onclose = null;
      this.#dc.onerror = null;
      this.#dc.onmessage = null;
      try {
        this.#dc.close();
      } catch {
        /* já fechado */
      }
      this.#dc = null;
    }

    if (this.#pc) {
      this.#pc.onconnectionstatechange = null;
      this.#pc.oniceconnectionstatechange = null;
      this.#pc.ontrack = null;
      // Não paramos a track: ela é compartilhada com as outras sessões.
      if (this.#sender) {
        try {
          this.#pc.removeTrack(this.#sender);
        } catch {
          /* peer connection já fechada */
        }
      }
      try {
        this.#pc.close();
      } catch {
        /* já fechada */
      }
      this.#pc = null;
    }
    this.#sender = null;

    if (this.#audio) {
      this.#audio.pause();
      this.#audio.srcObject = null;
    }

    this.#diagnostics.connectionState = "new";
    this.#diagnostics.dataChannelState = "none";
    this.#emitDiagnostics();
  }

  #clearTimers(): void {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#disconnectedTimer) {
      clearTimeout(this.#disconnectedTimer);
      this.#disconnectedTimer = null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Áudio traduzido                                                  */
  /* ---------------------------------------------------------------- */

  #ensureAudioElement(): HTMLAudioElement {
    if (!this.#audio) {
      const audio = new Audio();
      audio.autoplay = true;
      // `playsInline` evita que o iOS abra o player em tela cheia.
      (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      this.#audio = audio;
    }
    this.#audio.muted = this.#muted;
    this.#audio.volume = this.#volume;
    return this.#audio;
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    if (this.#audio) {
      this.#audio.muted = muted;
      if (!muted) void this.#audio.play().catch(() => undefined);
    }
  }

  setVolume(volume: number): void {
    this.#volume = volume;
    if (this.#audio) this.#audio.volume = volume;
  }

  get muted(): boolean {
    return this.#muted;
  }

  /** Troca a fonte de áudio sem derrubar a sessão (ex.: outro microfone). */
  async replaceTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.#sender) return;
    await this.#sender.replaceTrack(track);
    this.#log("track.replace", track.label || "(sem rótulo)");
  }

  /* ---------------------------------------------------------------- */
  /* Handlers                                                         */
  /* ---------------------------------------------------------------- */

  #attachPeerHandlers(pc: RTCPeerConnection, generation: number): void {
    pc.onconnectionstatechange = () => {
      if (this.#isStale(generation)) return;
      const state = pc.connectionState;
      this.#diagnostics.connectionState = state;
      this.#log("webrtc.connection", state);

      if (state === "connected") {
        this.#reconnectAttempt = 0;
        if (this.#disconnectedTimer) {
          clearTimeout(this.#disconnectedTimer);
          this.#disconnectedTimer = null;
        }
        if (this.#diagnostics.connectMs === null) {
          this.#diagnostics.connectMs = Math.round(
            performance.now() - this.#connectStartedAt,
          );
        }
        this.#setStatus("connected");
      } else if (state === "failed") {
        this.#scheduleReconnect({
          kind: "connection-lost",
          message: "A conexão com a OpenAI falhou.",
        });
      } else if (state === "disconnected") {
        this.#onDisconnected();
      }

      this.#emitDiagnostics();
    };

    pc.ontrack = ({ streams }) => {
      if (this.#isStale(generation)) return;
      const audio = this.#ensureAudioElement();
      audio.srcObject = streams[0] ?? null;
      if (this.#diagnostics.firstAudioMs === null) {
        this.#diagnostics.firstAudioMs = Math.round(
          performance.now() - this.#connectStartedAt,
        );
      }
      void audio.play().catch((error: unknown) => {
        this.#log("audio.play", messageOf(error));
      });
      this.#log("remote.audio", "track recebida");
      this.#emitDiagnostics();
    };
  }

  #attachDataChannelHandlers(dc: RTCDataChannel, generation: number): void {
    dc.onopen = () => {
      if (this.#isStale(generation)) return;
      this.#diagnostics.dataChannelState = "open";
      this.#log("datachannel", "open");
      this.#emitDiagnostics();
    };
    dc.onclose = () => {
      if (this.#isStale(generation)) return;
      this.#diagnostics.dataChannelState = "closed";
      this.#log("datachannel", "closed");
      this.#emitDiagnostics();
    };
    dc.onerror = () => {
      if (this.#isStale(generation)) return;
      this.#log("datachannel", "error");
    };
    dc.onmessage = ({ data }) => {
      if (this.#isStale(generation)) return;
      this.#handleServerEvent(data);
    };
  }

  #handleServerEvent(raw: unknown): void {
    if (typeof raw !== "string") return;

    let event: TranslationServerEvent;
    try {
      event = JSON.parse(raw) as TranslationServerEvent;
    } catch {
      this.#log("event", "mensagem não-JSON no data channel");
      return;
    }

    switch (event.type) {
      case "session.created":
      case "session.updated": {
        const session = (event as { session?: { id?: string; expires_at?: number } })
          .session;
        this.#diagnostics.sessionId = session?.id ?? null;
        this.#diagnostics.expiresAt =
          session?.expires_at ?? this.#diagnostics.expiresAt;
        this.#log(event.type, session?.id ?? "ok");
        this.#emitDiagnostics();
        return;
      }

      case "session.output_transcript.delta": {
        const delta = (event as { delta?: unknown }).delta;
        if (typeof delta !== "string") return;
        if (this.#diagnostics.firstTranscriptMs === null) {
          this.#diagnostics.firstTranscriptMs = Math.round(
            performance.now() - this.#connectStartedAt,
          );
          this.#log(
            "transcript.first",
            `${this.#diagnostics.firstTranscriptMs} ms`,
          );
          this.#emitDiagnostics();
        }
        this.#options.onOutputDelta(delta);
        return;
      }

      case "session.input_transcript.delta": {
        const delta = (event as { delta?: unknown }).delta;
        if (typeof delta === "string") this.#options.onInputDelta(delta);
        return;
      }

      case "session.closed": {
        this.#log("session.closed", "servidor encerrou a sessão");
        if (!this.#disposed) {
          this.#scheduleReconnect({
            kind: "connection-lost",
            message: "A OpenAI encerrou a sessão.",
          });
        }
        return;
      }

      case "error": {
        const detail = (event as { error?: { message?: string; code?: string } })
          .error;
        const message = detail?.message ?? "Erro desconhecido da API.";
        this.#log("api.error", `${detail?.code ?? "sem código"}: ${message}`);
        // A documentação diz que a maioria dos erros é recuperável e a sessão
        // continua aberta, então aqui só reportamos — não derrubamos a conexão.
        this.#options.onStatus(this.#status, {
          kind: detail?.code === "rate_limit_exceeded" ? "rate-limit" : "unknown",
          message,
        });
        return;
      }

      default:
        return;
    }
  }

  #onDisconnected(): void {
    if (this.#disconnectedTimer || this.#disposed) return;
    this.#setStatus("reconnecting");
    this.#disconnectedTimer = setTimeout(() => {
      this.#disconnectedTimer = null;
      if (this.#pc?.connectionState === "connected") return;
      this.#scheduleReconnect({
        kind: "connection-lost",
        message: "Conexão perdida.",
      });
    }, DISCONNECTED_GRACE_MS);
  }

  #scheduleReconnect(error: SessionError): void {
    if (this.#disposed || this.#reconnectTimer) return;

    if (this.#reconnectAttempt >= RECONNECT_BACKOFF_MS.length) {
      this.#log("reconnect", "tentativas esgotadas");
      this.#setStatus("error", {
        kind: error.kind,
        message: `${error.message} Não foi possível reconectar.`,
      });
      return;
    }

    const delay = RECONNECT_BACKOFF_MS[this.#reconnectAttempt];
    this.#reconnectAttempt += 1;
    this.#diagnostics.reconnects += 1;
    this.#setStatus("reconnecting", error);
    this.#log(
      "reconnect",
      `tentativa ${this.#reconnectAttempt} em ${delay} ms`,
    );
    this.#emitDiagnostics();

    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      void this.#connect(true);
    }, delay);
  }

  #handleFailure(error: unknown): void {
    const failure =
      error instanceof SessionFailure
        ? error
        : new SessionFailure(
            { kind: "unknown", message: messageOf(error) },
            true,
          );

    this.#log("connect.error", failure.detail.message);

    if (failure.retryable) {
      this.#scheduleReconnect(failure.detail);
    } else {
      this.#setStatus("error", failure.detail);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Token                                                            */
  /* ---------------------------------------------------------------- */

  async #requestClientSecret(): Promise<ClientSecretResponse> {
    const endpoint = this.#options.tokenEndpoint ?? "/api/realtime/token";
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A chave do usuário, quando existe, só trafega daqui até o Route
        // Handler da mesma origem. Nunca vai para a OpenAI a partir do browser.
        body: JSON.stringify({
          targetLanguage: this.targetLanguage,
          apiKey: readApiKey() ?? undefined,
        }),
      });
    } catch (error) {
      throw new SessionFailure(
        {
          kind: "api-unavailable",
          message: `Não foi possível falar com o servidor: ${messageOf(error)}`,
        },
        true,
      );
    }

    const payload = (await response.json().catch(() => null)) as
      | (ClientSecretResponse & { error?: string; kind?: SessionError["kind"] })
      | null;

    if (!response.ok || !payload?.value) {
      const kind = payload?.kind ?? classifyHttpError(response.status, "").kind;
      throw new SessionFailure(
        {
          kind,
          message: payload?.error ?? `Falha ao criar a sessão (HTTP ${response.status}).`,
        },
        kind === "api-unavailable" || kind === "rate-limit",
      );
    }

    return payload;
  }

  /* ---------------------------------------------------------------- */
  /* Utilidades                                                       */
  /* ---------------------------------------------------------------- */

  #isStale(generation: number): boolean {
    return this.#disposed || generation !== this.#generation;
  }

  #setStatus(status: SessionStatus, error?: SessionError): void {
    this.#status = status;
    this.#options.onStatus(status, error);
  }

  #emitDiagnostics(): void {
    this.#options.onDiagnostics(this.diagnostics);
  }

  #log(scope: string, detail: string): void {
    // Nunca logar client secret nem API key — só metadados de sessão.
    console.debug(`[translate:${this.targetLanguage}] ${scope} — ${detail}`);
  }
}

class SessionFailure extends Error {
  constructor(
    readonly detail: SessionError,
    readonly retryable: boolean,
  ) {
    super(detail.message);
    this.name = "SessionFailure";
  }
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
    return {
      kind: "rate-limit",
      message:
        "Limite de uso atingido. Reduza o número de idiomas simultâneos ou aguarde.",
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
