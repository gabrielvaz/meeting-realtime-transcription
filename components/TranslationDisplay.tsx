"use client";

import type { CSSProperties } from "react";

import { TranslationPanel } from "@/components/TranslationPanel";
import type { LanguageTrack } from "@/hooks/useRealtimeTranslation";
import { getCaptionFont, type CaptionFontId } from "@/lib/fonts";
import type { SubtitleSnapshot } from "@/lib/subtitleBuffer";
import type { ReadingPreferences } from "@/lib/transcriptLog";
import type { TargetLanguageCode } from "@/types/realtime";

interface TranslationDisplayProps {
  tracks: LanguageTrack[];
  sourceSubtitle: SubtitleSnapshot;
  sourceActive: boolean;
  paused: boolean;
  preferences: ReadingPreferences;
  showAudioControls: boolean;
  onListen: (language: TargetLanguageCode) => void;
  onToggleMute: (language: TargetLanguageCode, muted: boolean) => void;
  onVolume: (language: TargetLanguageCode, volume: number) => void;
}

export function TranslationDisplay({
  tracks,
  sourceSubtitle,
  sourceActive,
  paused,
  preferences,
  showAudioControls,
  onListen,
  onToggleMute,
  onVolume,
}: TranslationDisplayProps) {
  // O tamanho base da legenda vem da quantidade de idiomas; a organização é
  // escolha do usuário e só muda o grid, não a escala.
  const density = tracks.length === 1 ? "one" : tracks.length === 2 ? "two" : "many";
  const font = getCaptionFont(preferences.fontId as CaptionFontId);

  const style = {
    fontFamily: font.stack,
    "--caption-scale": preferences.scale,
  } as CSSProperties;

  return (
    <main className="stage flex min-h-0 flex-1 flex-col">
      {preferences.showOriginal ? (
        <section className="flex-none border-b border-border px-5 py-3.5" style={style}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            Original — detecção automática
          </h2>
          <p className="source-text mt-1.5 leading-[1.45] text-muted-foreground">
            {sourceSubtitle.previous ? (
              <span className="opacity-45">{sourceSubtitle.previous} </span>
            ) : null}
            {sourceSubtitle.current ||
              (sourceSubtitle.previous ? "" : paused ? "Pausado" : "Aguardando fala")}
          </p>
        </section>
      ) : null}

      <div
        className="grid min-h-0 flex-1 gap-px bg-border"
        data-density={density}
        data-arrangement={preferences.arrangement}
        style={style}
      >
        {tracks.map((track) => (
          <TranslationPanel
            key={track.language}
            track={track}
            paused={paused}
            sourceActive={sourceActive}
            showAudioControls={showAudioControls}
            onListen={onListen}
            onToggleMute={onToggleMute}
            onVolume={onVolume}
          />
        ))}
      </div>
    </main>
  );
}
