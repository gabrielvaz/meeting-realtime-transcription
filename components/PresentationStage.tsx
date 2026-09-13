"use client";

import { useEffect, useRef } from "react";

import { TranslationDisplay } from "@/components/TranslationDisplay";
import type { Deck } from "@/lib/deck";
import type { LanguageTrack } from "@/hooks/useRealtimeTranslation";
import type { SubtitleSnapshot } from "@/lib/subtitleBuffer";
import type { ReadingPreferences } from "@/lib/transcriptLog";

type Band = ReadingPreferences["captionBand"];

const HEIGHT: Record<Band, string> = {
  small: "clamp(110px, 20vh, 220px)",
  medium: "clamp(150px, 30vh, 340px)",
  large: "clamp(200px, 42vh, 520px)",
};

const WIDTH: Record<Band, string> = {
  small: "clamp(220px, 22vw, 340px)",
  medium: "clamp(300px, 32vw, 520px)",
  large: "clamp(380px, 44vw, 720px)",
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
 * Modo apresentação: os slides ocupam a tela e as legendas vão para onde o
 * usuário mandar — embaixo, em cima, na lateral, sobrepostas ou escondidas.
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
  const layout = preferences.captionLayout;

  // As setas do teclado precisam chegar aos slides, não à página.
  useEffect(() => {
    const frame = frameRef.current;
    const timer = window.setTimeout(() => frame?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [deck]);

  const captions = (
    <TranslationDisplay
      tracks={tracks}
      sourceSubtitle={sourceSubtitle}
      sourceActive={sourceActive}
      paused={paused}
      preferences={preferences}
    />
  );

  const slides = (
    <div className="min-h-0 min-w-0 flex-1 bg-background">
      {/*
        `srcDoc` em vez de um blob URL: sem objeto para criar, revogar ou vazar
        quando o usuário troca de arquivo no meio da apresentação. A origem
        opaca vem do `sandbox` sem `allow-same-origin`.

        Fundo branco e `colorScheme: light` fixos: um deck que não define o
        próprio fundo herdaria o canvas escuro do tema e ficaria com texto preto
        sobre preto. Não dá para reestilizar o documento do usuário — ele é de
        outra origem —, então garantimos o que o autor dele assumiu. Deck que
        define o próprio fundo pinta por cima.
      */}
      <iframe
        ref={frameRef}
        srcDoc={deck.html}
        title={`Slides: ${deck.name}`}
        data-deck-frame=""
        className="size-full border-0"
        style={{ background: "#ffffff", colorScheme: "light" }}
        sandbox="allow-scripts allow-popups allow-forms allow-modals"
        allow="fullscreen"
      />
    </div>
  );

  if (layout === "hidden") {
    return (
      <main className="flex min-h-0 flex-1 flex-col" data-layout="hidden">
        {slides}
      </main>
    );
  }

  if (layout === "overlay") {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col" data-layout="overlay">
        {slides}
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col border-t border-border"
          style={{ height: HEIGHT[preferences.captionBand] }}
          data-caption-band=""
          data-caption-overlay=""
        >
          {captions}
        </div>
      </main>
    );
  }

  if (layout === "right") {
    return (
      <main className="flex min-h-0 flex-1 flex-row" data-layout="right">
        {slides}
        <div
          className="flex flex-none flex-col border-l border-border"
          style={{ width: WIDTH[preferences.captionBand] }}
          data-caption-band=""
        >
          {captions}
        </div>
      </main>
    );
  }

  const band = (
    <div
      className={`flex flex-none flex-col ${
        layout === "top" ? "border-b" : "border-t"
      } border-border`}
      style={{ height: HEIGHT[preferences.captionBand] }}
      data-caption-band=""
    >
      {captions}
    </div>
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col" data-layout={layout}>
      {layout === "top" ? band : null}
      {slides}
      {layout === "bottom" ? band : null}
    </main>
  );
}
