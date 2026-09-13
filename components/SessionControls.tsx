"use client";

import { AudioWaveform } from "@/components/AudioWaveform";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LanguageMenu } from "@/components/LanguageMenu";
import { ReadingMenu } from "@/components/ReadingMenu";
import { SettingsDialog } from "@/components/SettingsDialog";
import { TranscriptHistory } from "@/components/TranscriptHistory";
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
  showOriginal: boolean;
  preferences: ReadingPreferences;
  glossary: GlossaryEntry[];
  stream: MediaStream | null;
  onGlossaryChange: (entries: GlossaryEntry[]) => void;
  onToggleLanguage: (language: TargetLanguageCode) => void;
  onToggleOriginal: (value: boolean) => void;
  onPreferences: (patch: Partial<ReadingPreferences>) => void;
  onTogglePause: () => void;
  onClear: () => void;
  onStop: () => void;
}

/** Barra discreta exibida durante a tradução. */
export function SessionControls({
  elapsedSeconds,
  selected,
  reconnecting,
  paused,
  showOriginal,
  preferences,
  glossary,
  stream,
  onGlossaryChange,
  onToggleLanguage,
  onToggleOriginal,
  onPreferences,
  onTogglePause,
  onClear,
  onStop,
}: SessionControlsProps) {
  const label = paused
    ? "Pausado"
    : reconnecting
      ? "Reconectando"
      : "Traduzindo ao vivo";

  return (
    <header className="live-bar flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-2.5 text-xs text-muted-foreground">
      <span
        className={`size-[7px] flex-none rounded-full ${
          paused || reconnecting ? "bg-muted-foreground" : "bg-foreground"
        }`}
        aria-hidden="true"
      />
      <span className="uppercase tracking-[0.08em] text-foreground">{label}</span>
      <time className="live-clock tabular-nums text-foreground">
        {formatClock(elapsedSeconds)}
      </time>

      {/* A onda fica visível na sessão inteira: é a resposta para "o microfone
          está me ouvindo?" sem precisar abrir nada. Pausado, ela cai para a
          linha de base, porque a captura realmente para. */}
      <AudioWaveform stream={paused ? null : stream} width={112} height={22} />

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
        <ReadingMenu preferences={preferences} onChange={onPreferences} />
        {/* Alcançável durante a reunião: é falando que se descobre que um termo
            está saindo errado. A correção passa a valer no texto seguinte. */}
        <SettingsDialog
          glossary={glossary}
          onGlossaryChange={onGlossaryChange}
          trigger={
            <Button variant="outline" size="sm" className="h-7 text-xs" data-action="settings">
              Dicionário
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
    </header>
  );
}
