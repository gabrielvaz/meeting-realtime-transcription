"use client";

import { useEffect, useRef } from "react";

import { TranslationDisplay } from "@/components/TranslationDisplay";
import type { Deck } from "@/lib/deck";
import type { LanguageTrack } from "@/hooks/useRealtimeTranslation";
import type { SubtitleSnapshot } from "@/lib/subtitleBuffer";
import type { ReadingPreferences } from "@/lib/transcriptLog";

const BAND_HEIGHT: Record<ReadingPreferences["captionBand"], string> = {
  small: "clamp(110px, 20vh, 220px)",
  medium: "clamp(150px, 30vh, 340px)",
  large: "clamp(200px, 42vh, 520px)",
};

interface PresentationStageProps {
  deck: Deck;
  tracks: LanguageTrack[];
  sourceSubtitle: SubtitleSnapshot;
  sourceActive: boolean;
  paused: boolean;
  preferences: ReadingPreferences;
}

/**
 * Modo apresentação: os slides ocupam a tela e as legendas ficam numa faixa
 * embaixo.
 *
 * O HTML do usuário roda num iframe de **origem opaca** (`allow-scripts` sem
 * `allow-same-origin`): os slides continuam interativos — setas do teclado,
 * cliques, animações — mas o documento não alcança o `localStorage` desta
 * aplicação, onde fica a chave da OpenAI. Ver `lib/deck.ts`.
 */
export function PresentationStage({
  deck,
  tracks,
  sourceSubtitle,
  sourceActive,
  paused,
  preferences,
}: PresentationStageProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  // As setas do teclado precisam chegar aos slides, não à página.
  useEffect(() => {
    const frame = frameRef.current;
    const timer = window.setTimeout(() => frame?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [deck]);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 bg-background">
        {/*
          `srcDoc` em vez de um blob URL: sem objeto para criar, revogar ou
          vazar quando o usuário troca de arquivo no meio da apresentação.
          A origem opaca vem do `sandbox` sem `allow-same-origin`, e vale nos
          dois casos.
        */}
        <iframe
          ref={frameRef}
          srcDoc={deck.html}
          title={`Slides: ${deck.name}`}
          data-deck-frame=""
          className="size-full border-0"
          sandbox="allow-scripts allow-popups allow-forms allow-modals"
          allow="fullscreen"
        />
      </div>

      <div
        className="flex flex-none flex-col border-t border-border"
        style={{ height: BAND_HEIGHT[preferences.captionBand] }}
        data-caption-band=""
      >
        <TranslationDisplay
          tracks={tracks}
          sourceSubtitle={sourceSubtitle}
          sourceActive={sourceActive}
          paused={paused}
          preferences={preferences}
        />
      </div>
    </main>
  );
}
