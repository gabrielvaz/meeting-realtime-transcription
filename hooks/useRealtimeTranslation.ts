"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SubtitleBuffer, type SubtitleSnapshot } from "@/lib/subtitleBuffer";
import {
  TranslationSession,
  type TranslationSessionDiagnostics,
} from "@/lib/openai/realtimeTranslation";
import { saveSession, type SessionLog } from "@/lib/transcriptLog";
import { UsageMeter } from "@/lib/usage";
import type {
  SessionError,
  SessionStatus,
  TargetLanguageCode,
} from "@/types/realtime";

const EMPTY_SUBTITLE: SubtitleSnapshot = { segments: [], current: "", revision: 0 };

const IDLE_FLUSH_TICK_MS = 400;
const CLOCK_TICK_MS = 1_000;
/** Salva o histórico durante a sessão para não perder tudo se a aba cair. */
const AUTOSAVE_MS = 15_000;

export interface LanguageTrack {
  language: TargetLanguageCode;
  status: SessionStatus;
  error: SessionError | null;
  subtitle: SubtitleSnapshot;
  /**
   * Desmarcar um idioma o esconde e fecha a sessão, mas **não** apaga o que já
   * foi traduzido. Marcar de novo reabre a sessão e o texto reaparece.
   */
  visible: boolean;
  diagnostics: TranslationSessionDiagnostics | null;
}

export type RunState = "idle" | "starting" | "running" | "paused" | "stopping";

export interface UsageSnapshot {
  elapsedSeconds: number;
  languageMinutes: number;
  activeLanguages: number;
}

interface UseRealtimeTranslationOptions {
  /** Fonte de áudio compartilhada — capturada uma única vez. */
  getStream: () => MediaStream | null;
}

export function useRealtimeTranslation({ getStream }: UseRealtimeTranslationOptions) {
  const [runState, setRunState] = useState<RunState>("idle");
  const [tracks, setTracks] = useState<Record<string, LanguageTrack>>({});
  const [sourceSubtitle, setSourceSubtitle] = useState<SubtitleSnapshot>(EMPTY_SUBTITLE);
  /** A transcrição da origem recebeu deltas há pouco? */
  const [sourceActive, setSourceActive] = useState(false);
  const [usage, setUsage] = useState<UsageSnapshot>({
    elapsedSeconds: 0,
    languageMinutes: 0,
    activeLanguages: 0,
  });

  const sessionsRef = useRef(new Map<TargetLanguageCode, TranslationSession>());
  const buffersRef = useRef(new Map<TargetLanguageCode, SubtitleBuffer>());
  const sourceBufferRef = useRef<SubtitleBuffer | null>(null);
  const meterRef = useRef(new UsageMeter());

  /** Trechos fechados, acumulados para o histórico. */
  const segmentsRef = useRef(new Map<TargetLanguageCode, string[]>());
  const sourceSegmentsRef = useRef<string[]>([]);
  const logIdRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const languagesEverRef = useRef(new Set<TargetLanguageCode>());

  /**
   * Cada sessão transcreve a origem por conta própria. Só uma delas alimenta a
   * transcrição original, senão o texto sairia duplicado por idioma.
   */
  const sourceOwnerRef = useRef<TargetLanguageCode | null>(null);
  const lastSourceDeltaRef = useRef(0);

  const ensureSourceBuffer = useCallback(() => {
    if (!sourceBufferRef.current) {
      sourceBufferRef.current = new SubtitleBuffer((segment) => {
        sourceSegmentsRef.current.push(segment);
      });
    }
    return sourceBufferRef.current;
  }, []);

  const patchTrack = useCallback(
    (language: TargetLanguageCode, patch: Partial<LanguageTrack>) => {
      setTracks((previous) => {
        const current = previous[language];
        if (!current) return previous;
        return { ...previous, [language]: { ...current, ...patch } };
      });
    },
    [],
  );

  /* ---------------------------------------------------------------- */
  /* Histórico                                                        */
  /* ---------------------------------------------------------------- */

  const persist = useCallback((ended: boolean) => {
    if (!logIdRef.current) return;
    const translations: SessionLog["translations"] = {};
    for (const [language, segments] of segmentsRef.current) {
      if (segments.length) translations[language] = [...segments];
    }
    const log: SessionLog = {
      id: logIdRef.current,
      startedAt: startedAtRef.current,
      endedAt: ended ? Date.now() : null,
      durationMs: meterRef.current.elapsedMs(),
      languageMinutes: meterRef.current.languageMinutes(),
      languages: [...languagesEverRef.current],
      source: [...sourceSegmentsRef.current],
      translations,
    };
    // Sessão sem nada transcrito não vira entrada no histórico.
    if (!log.source.length && !Object.keys(translations).length) return;
    saveSession(log);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Sessões                                                          */
  /* ---------------------------------------------------------------- */

  const createSession = useCallback(
    (language: TargetLanguageCode) => {
      // Ao retomar depois de uma pausa o buffer é reaproveitado, e é isso que
      // faz a legenda continuar de onde parou em vez de recomeçar do zero.
      let buffer = buffersRef.current.get(language);
      if (!buffer) {
        if (!segmentsRef.current.has(language)) segmentsRef.current.set(language, []);
        buffer = new SubtitleBuffer((segment) => {
          segmentsRef.current.get(language)?.push(segment);
        });
        buffersRef.current.set(language, buffer);
      }
      const activeBuffer = buffer;
      languagesEverRef.current.add(language);

      const session = new TranslationSession({
        targetLanguage: language,
        getStream,
        onStatus: (status, error) => {
          patchTrack(language, { status, error: error ?? null });
        },
        onOutputDelta: (delta) => {
          activeBuffer.append(delta);
          patchTrack(language, { subtitle: activeBuffer.snapshot() });
        },
        onInputDelta: (delta) => {
          if (sourceOwnerRef.current !== language) return;
          lastSourceDeltaRef.current = Date.now();
          const source = ensureSourceBuffer();
          source.append(delta);
          setSourceSubtitle(source.snapshot());
        },
        onDiagnostics: (diagnostics) => {
          patchTrack(language, { diagnostics });
        },
      });

      sessionsRef.current.set(language, session);
      meterRef.current.openLanguage(language);

      setTracks((previous) => ({
        ...previous,
        [language]: {
          language,
          status: "requesting-token",
          error: null,
          subtitle: activeBuffer.snapshot(),
          visible: true,
          diagnostics: null,
        },
      }));

      void session.start();
      return session;
    },
    [ensureSourceBuffer, getStream, patchTrack],
  );

  /** Fecha a conexão. `keepBuffer` preserva o texto (usado na pausa). */
  const destroySession = useCallback(
    (language: TargetLanguageCode, keepBuffer = false) => {
      const session = sessionsRef.current.get(language);
      if (!session) return;

      session.cleanup();
      sessionsRef.current.delete(language);
      meterRef.current.closeLanguage(language);

      if (keepBuffer) {
        patchTrack(language, { status: "closed" });
        return;
      }


      buffersRef.current.delete(language);
      setTracks((previous) => {
        const next = { ...previous };
        delete next[language];
        return next;
      });

      if (sourceOwnerRef.current === language) {
        sourceOwnerRef.current = sessionsRef.current.keys().next().value ?? null;
      }
    },
    [patchTrack],
  );

  /** Liga ou desliga a captura sem soltar o microfone. */
  const setCaptureEnabled = useCallback(
    (enabled: boolean) => {
      for (const track of getStream()?.getAudioTracks() ?? []) {
        track.enabled = enabled;
      }
    },
    [getStream],
  );

  /* ---------------------------------------------------------------- */
  /* Controles públicos                                               */
  /* ---------------------------------------------------------------- */

  const start = useCallback(
    (languages: readonly TargetLanguageCode[]) => {
      if (!languages.length) return;
      setRunState("starting");

      meterRef.current.start();
      buffersRef.current.clear();
      segmentsRef.current.clear();
      sourceSegmentsRef.current = [];
      sourceBufferRef.current = null;
      setSourceSubtitle(ensureSourceBuffer().snapshot());
      languagesEverRef.current = new Set();
      logIdRef.current = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      startedAtRef.current = Date.now();
      sourceOwnerRef.current = languages[0];
      lastSourceDeltaRef.current = 0;
      setSourceActive(false);
      setCaptureEnabled(true);

      languages.forEach((language) => createSession(language));
      setRunState("running");
    },
    [createSession, ensureSourceBuffer, setCaptureEnabled],
  );

  const stop = useCallback(() => {
    setRunState("stopping");
    for (const language of [...sessionsRef.current.keys()]) {
      buffersRef.current.get(language)?.finalize();
      destroySession(language);
    }
    sourceBufferRef.current?.finalize();
    setSourceSubtitle(sourceBufferRef.current?.snapshot() ?? EMPTY_SUBTITLE);
    meterRef.current.stop();
    persist(true);

    sourceOwnerRef.current = null;
    logIdRef.current = null;
    setRunState("idle");
  }, [destroySession, persist]);

  /**
   * Pausa de verdade: o microfone para de enviar áudio e as sessões são
   * fechadas, então a cobrança por minuto também para. O texto fica onde está.
   */
  const pause = useCallback(() => {
    if (!sessionsRef.current.size) return;
    setCaptureEnabled(false);
    for (const language of [...sessionsRef.current.keys()]) {
      buffersRef.current.get(language)?.finalize();
      destroySession(language, true);
    }
    sourceBufferRef.current?.finalize();
    setSourceSubtitle(sourceBufferRef.current?.snapshot() ?? EMPTY_SUBTITLE);
    meterRef.current.pause();
    setSourceActive(false);
    persist(false);
    setRunState("paused");
  }, [destroySession, persist, setCaptureEnabled]);

  const resume = useCallback(
    (languages: readonly TargetLanguageCode[]) => {
      setCaptureEnabled(true);
      meterRef.current.resume();
      sourceOwnerRef.current = languages[0] ?? null;
      languages.forEach((language) => {
        if (sessionsRef.current.has(language)) return;
        createSession(language);
      });
      setRunState("running");
    },
    [createSession, setCaptureEnabled],
  );

  /** Apaga o texto em tela e o que seria gravado no histórico desta sessão. */
  const clearTranscripts = useCallback(() => {
    for (const [language, buffer] of buffersRef.current) {
      buffer.reset();
      segmentsRef.current.set(language, []);
      patchTrack(language, { subtitle: buffer.snapshot() });
    }
    sourceSegmentsRef.current = [];
    sourceBufferRef.current?.reset();
    setSourceSubtitle(sourceBufferRef.current?.snapshot() ?? EMPTY_SUBTITLE);
    lastSourceDeltaRef.current = 0;
    setSourceActive(false);
  }, [patchTrack]);

  /** Marca o idioma de novo: reabre a sessão e o texto anterior reaparece. */
  const addLanguage = useCallback(
    (language: TargetLanguageCode) => {
      if (sessionsRef.current.has(language)) return;
      if (!sourceOwnerRef.current) sourceOwnerRef.current = language;
      createSession(language);
    },
    [createSession],
  );

  /**
   * Desmarcar esconde o idioma e fecha a sessão (parando a cobrança), mas o
   * buffer sobrevive: o texto já traduzido reaparece intacto se o idioma for
   * marcado de novo.
   */
  const removeLanguage = useCallback(
    (language: TargetLanguageCode) => {
      buffersRef.current.get(language)?.finalize();
      destroySession(language, true);
      patchTrack(language, { visible: false, status: "closed" });
    },
    [destroySession, patchTrack],
  );

  /** Repassa uma nova track (troca de microfone) sem derrubar as sessões. */
  const replaceTrack = useCallback(async (track: MediaStreamTrack) => {
    await Promise.all(
      [...sessionsRef.current.values()].map((session) => session.replaceTrack(track)),
    );
  }, []);

  /* ---------------------------------------------------------------- */
  /* Timers                                                           */
  /* ---------------------------------------------------------------- */

  // Fecha trechos por silêncio: a API não emite evento de fim de frase.
  useEffect(() => {
    if (runState !== "running") return;
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [language, buffer] of buffersRef.current) {
        if (buffer.flushIdle(now)) {
          patchTrack(language, { subtitle: buffer.snapshot() });
        }
      }
      if (sourceBufferRef.current?.flushIdle(now)) {
        setSourceSubtitle(sourceBufferRef.current.snapshot());
      }
      // Origem sendo transcrita nos últimos 5 s. Serve para distinguir
      // "não estou ouvindo você" de "ouvi, mas não havia o que traduzir".
      setSourceActive(
        lastSourceDeltaRef.current > 0 && now - lastSourceDeltaRef.current < 5_000,
      );
    }, IDLE_FLUSH_TICK_MS);
    return () => clearInterval(timer);
  }, [runState, patchTrack]);

  useEffect(() => {
    if (runState === "idle") return;
    const update = () => {
      const meter = meterRef.current;
      setUsage({
        elapsedSeconds: meter.elapsedSeconds(),
        languageMinutes: meter.languageMinutes(),
        activeLanguages: meter.activeLanguages(),
      });
    };
    update();
    const timer = setInterval(update, CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [runState]);

  // Autosave: fechar a aba no meio de uma reunião não pode custar o transcript.
  useEffect(() => {
    if (runState !== "running") return;
    const timer = setInterval(() => persist(false), AUTOSAVE_MS);
    const onHide = () => persist(false);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [runState, persist]);

  // Rede de segurança: desmontar a página fecha tudo.
  useEffect(() => {
    const sessions = sessionsRef.current;
    return () => {
      for (const session of sessions.values()) session.cleanup();
      sessions.clear();
    };
  }, []);

  return {
    runState,
    tracks,
    sourceSubtitle,
    sourceActive,
    usage,
    start,
    stop,
    pause,
    resume,
    clearTranscripts,
    addLanguage,
    removeLanguage,
    replaceTrack,
  };
}
