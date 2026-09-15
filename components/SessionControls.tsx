"use client";

import { AudioWaveform } from "@/components/AudioWaveform";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LanguageMenu } from "@/components/LanguageMenu";
import { LayoutMenu } from "@/components/LayoutMenu";
import { ReadingMenu } from "@/components/ReadingMenu";
import { SettingsDialog } from "@/components/SettingsDialog";
import { TranscriptHistory } from "@/components/TranscriptHistory";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { getLanguage } from "@/lib/languages";
import type { GlossaryEntry } from "@/lib/glossary";
import type { ReadingPreferences } from "@/lib/transcriptLog";
import { formatClock } from "@/lib/usage";
import type { TargetLanguageCode } from "@/types/realtime";

interface SessionControlsProps {
  elapsedSeconds: number;
  /** Idiomas marcados (inclui os que ainda vão abrir sessão). */
  selected: readonly TargetLanguageCode[];
  reconnecting: boolean;
  paused: boolean;
  /** Tradução encerrada, mas o texto segue em tela. */
  stopped: boolean;
  showOriginal: boolean;
  preferences: ReadingPreferences;
  glossary: GlossaryEntry[];
  stream: MediaStream | null;
  /** Modo apresentação: libera os controles de slides e de tela cheia. */
  presenting: boolean;
  onGlossaryChange: (entries: GlossaryEntry[]) => void;
  onChangeDeck: () => void;
  onToggleLanguage: (language: TargetLanguageCode) => void;
  onToggleOriginal: (value: boolean) => void;
  onPreferences: (patch: Partial<ReadingPreferences>) => void;
  onTogglePause: () => void;
  onClear: () => void;
  onStop: () => void;
  onClose: () => void;
}

/** Barra discreta exibida durante a tradução. */
export function SessionControls({
  elapsedSeconds,
  selected,
  reconnecting,
  paused,
  stopped,
  showOriginal,
  preferences,
  glossary,
  stream,
  presenting,
  onGlossaryChange,
  onChangeDeck,
  onToggleLanguage,
  onToggleOriginal,
  onPreferences,
  onTogglePause,
  onClear,
  onStop,
  onClose,
}: SessionControlsProps) {
  const label = stopped
    ? "Transcrição encerrada"
    : paused
      ? "Pausado"
      : reconnecting
        ? "Reconectando"
        : "Traduzindo ao vivo";

  return (
    <header className="live-bar relative flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-2.5 text-xs text-muted-foreground">
      {/*
        Centralizado na tela, não no fluxo: a barra é densa e um item no meio
        empurraria os controles. Fora do fluxo, ele nunca disputa espaço — e
        `pointer-events-none` garante que jamais fique na frente de um clique.
        Some abaixo de 1280px, onde a barra quebra em duas linhas e já não há
        centro para ocupar.
      */}
      <span className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 justify-center xl:flex">
        <Wordmark height={10} className="opacity-70" />
      </span>
      <span
        className={`size-[7px] flex-none rounded-full ${
          stopped ? "border border-muted-foreground" : ""
        } ${paused || reconnecting ? "bg-muted-foreground" : stopped ? "" : "bg-foreground"}`}
        aria-hidden="true"
      />
      <span className="uppercase tracking-[0.08em] text-foreground">{label}</span>
      {/* Relógio e transporte juntos: são a mesma decisão — quanto tempo já
          corre e o que fazer com ele. */}
      <time className="live-clock tabular-nums text-foreground">
        {formatClock(elapsedSeconds)}
      </time>
      {stopped ? null : (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            data-pause-toggle=""
            onClick={onTogglePause}
          >
            {paused ? "Retomar" : "Pausar"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            data-action="stop"
            onClick={onStop}
          >
            Parar
          </Button>
        </div>
      )}

      {/* A onda fica visível na sessão inteira: é a resposta para "o microfone
          está me ouvindo?" sem precisar abrir nada. Pausado, ela cai para a
          linha de base, porque a captura realmente para. */}
      <AudioWaveform stream={paused || stopped ? null : stream} width={112} height={22} />

      <span className="min-w-0 flex-1 truncate">
        {selected.map((code) => getLanguage(code).label).join(" · ")}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <LanguageMenu
          selected={selected}
          showOriginal={showOriginal}
          onToggleLanguage={onToggleLanguage}
          onToggleOriginal={onToggleOriginal}
        />
        {presenting ? (
          <LayoutMenu preferences={preferences} onChange={onPreferences} />
        ) : (
          <ReadingMenu preferences={preferences} onChange={onPreferences} />
        )}
        {presenting ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              data-action="deck"
              onClick={onChangeDeck}
            >
              Slides
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              data-action="fullscreen"
              onClick={() => {
                // A tela cheia vale para o app inteiro, não só para os slides:
                // as legendas precisam continuar visíveis na projeção.
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen().catch(() => undefined);
              }}
            >
              Tela cheia
            </Button>
          </>
        ) : null}
        {/* Alcançável durante a reunião: é falando que se descobre que um termo
            está saindo errado. A correção passa a valer no texto seguinte. */}
        <SettingsDialog
          glossary={glossary}
          preferences={preferences}
          onGlossaryChange={onGlossaryChange}
          onPreferencesChange={onPreferences}
          defaultTab="appearance"
          trigger={
            <Button variant="outline" size="sm" className="h-7 text-xs" data-action="settings">
              Ajustes
            </Button>
          }
        />
        <TranscriptHistory
          trigger={
            <Button variant="outline" size="sm" className="h-7 text-xs" data-action="history">
              Histórico
            </Button>
          }
        />
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm" className="h-7 text-xs" data-action="clear">
              Limpar
            </Button>
          }
          title="Limpar a transcrição?"
          description="O texto em tela e o que foi acumulado nesta sessão são apagados. As transcrições já guardadas no histórico não são afetadas."
          confirmLabel="Limpar"
          onConfirm={onClear}
        />
        {/* Fechar descarta o que está em tela — por isso confirma, e Parar não:
            parar só encerra a tradução e deixa o texto onde está. */}
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm" className="h-7 text-xs" data-action="close">
              Fechar
            </Button>
          }
          title="Fechar a transcrição?"
          description={
            stopped
              ? "O texto em tela será descartado. O que foi transcrito já está salvo no histórico."
              : "A tradução em andamento será encerrada e o texto em tela, descartado. O que foi transcrito até agora fica salvo no histórico."
          }
          confirmLabel="Fechar"
          onConfirm={onClose}
        />
      </div>
    </header>
  );
}
