"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { getLanguage } from "@/lib/languages";
import type { LanguageTrack } from "@/hooks/useRealtimeTranslation";
import type { SessionStatus, TargetLanguageCode } from "@/types/realtime";

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: "Parado",
  "requesting-token": "Autenticando",
  connecting: "Conectando",
  connected: "",
  reconnecting: "Reconectando",
  closed: "Encerrado",
  error: "Erro",
};

interface TranslationPanelProps {
  track: LanguageTrack;
  showAudioControls: boolean;
  /** A transcrição da origem está recebendo deltas agora? */
  sourceActive: boolean;
  paused: boolean;
  onListen: (language: TargetLanguageCode) => void;
  onToggleMute: (language: TargetLanguageCode, muted: boolean) => void;
  onVolume: (language: TargetLanguageCode, volume: number) => void;
}

export function TranslationPanel({
  track,
  showAudioControls,
  sourceActive,
  paused,
  onListen,
  onToggleMute,
  onVolume,
}: TranslationPanelProps) {
  const language = getLanguage(track.language);
  const scrollRef = useRef<HTMLDivElement>(null);
  const statusLabel = STATUS_LABEL[track.status];

  // Comportamento de closed caption: a frase atual fica sempre visível embaixo.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [track.subtitle.revision]);

  const empty = !track.subtitle.current && !track.subtitle.previous;
  const connected = track.status === "connected" || paused;

  /**
   * O modelo evita traduzir fala que já está no idioma de saída, e nesse caso
   * simplesmente não emite nada. Se a origem está sendo transcrita e esta
   * sessão continua vazia, é quase certo que é isso — dizer isso vale mais do
   * que deixar a pessoa achando que o microfone quebrou.
   */
  const likelySameLanguage = connected && empty && sourceActive;

  return (
    <section className="panel flex min-h-0 min-w-0 flex-col bg-background px-4 pb-5 pt-[18px] sm:px-6 lg:px-10" lang={language.htmlLang}>
      <div className="mb-3 flex flex-none flex-wrap items-center gap-3">
        <h2 className="panel-title text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {language.native}
        </h2>
        {statusLabel ? (
          <span className="panel-status text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
            {statusLabel}
          </span>
        ) : null}
        {track.error ? (
          <span className="panel-error text-xs text-destructive" role="status">
            {track.error.message}
          </span>
        ) : null}

        {showAudioControls ? (
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onListen(track.language)}
              disabled={!track.muted}
            >
              Ouvir tradução
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onToggleMute(track.language, !track.muted)}
            >
              {track.muted ? "Ativar som" : "Mute"}
            </Button>
            <Slider
              className="w-[88px]"
              min={0}
              max={1}
              step={0.05}
              value={[track.volume]}
              aria-label={`Volume de ${language.label}`}
              onValueChange={([value]) => onVolume(track.language, value)}
            />
          </div>
        ) : null}
      </div>

      {/* Closed caption, não histórico de conversa: só o trecho atual e o
          imediatamente anterior entram no DOM. Os mais antigos saem de cena. */}
      <div
        className="panel-body flex min-h-0 flex-1 flex-col justify-end gap-[0.4em] overflow-y-auto pb-[0.25em] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        ref={scrollRef}
      >
        {track.subtitle.previous ? (
          <p className="caption is-previous opacity-[0.42]">{track.subtitle.previous}</p>
        ) : null}
        {track.subtitle.current ? (
          <p className="caption is-current">{track.subtitle.current}</p>
        ) : null}
        {empty && connected ? (
          <p className="text-sm tracking-[0.04em] text-muted-foreground/70">
            {paused
              ? "Pausado"
              : likelySameLanguage
                ? `Ouvindo, mas sem tradução: o modelo não traduz fala que já está em ${language.label}.`
                : "Aguardando fala"}
          </p>
        ) : null}
      </div>
    </section>
  );
}
