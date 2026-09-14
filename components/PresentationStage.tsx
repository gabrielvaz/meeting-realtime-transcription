"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SplitHandle, type SplitEdge } from "@/components/SplitHandle";
import { TranslationDisplay } from "@/components/TranslationDisplay";
import type { Deck } from "@/lib/deck";
import type { LanguageTrack } from "@/hooks/useRealtimeTranslation";
import type { SubtitleSnapshot } from "@/lib/subtitleBuffer";
import { DEFAULT_PREFERENCES, type ReadingPreferences } from "@/lib/transcriptLog";

type Layout = ReadingPreferences["captionLayout"];
type SizedLayout = Exclude<Layout, "hidden">;

const EDGE: Record<SizedLayout, SplitEdge> = {
  bottom: "bottom",
  top: "top",
  right: "right",
  overlay: "bottom",
};

interface PresentationStageProps {
  deck: Deck;
  tracks: LanguageTrack[];
  sourceSubtitle: SubtitleSnapshot;
  sourceActive: boolean;
  paused: boolean;
  preferences: ReadingPreferences;
  onPreferences: (patch: Partial<ReadingPreferences>) => void;
}

/**
 * Modo apresentação: os slides ocupam a tela e as legendas vão para onde o
 * usuário mandar — embaixo, em cima, na lateral, sobrepostas ou escondidas.
 *
 * A divisa entre as duas áreas é arrastável em todos os layouts, e o tamanho é
 * guardado por layout. Durante o arrasto o tamanho vive em estado local e só
 * vai para o `localStorage` ao soltar.
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
  onPreferences,
}: PresentationStageProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  /** Tamanho durante o arrasto; `null` quando vale o que está salvo. */
  const [live, setLive] = useState<number | null>(null);

  const layout = preferences.captionLayout;
  const sized = layout !== "hidden" ? (layout as SizedLayout) : null;
  const size = sized ? (live ?? preferences.bandSize[sized]) : 0;

  // As setas do teclado precisam chegar aos slides, não à página.
  useEffect(() => {
    const frame = frameRef.current;
    const timer = window.setTimeout(() => frame?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [deck]);

  const commit = useCallback(
    (value: number) => {
      if (!sized) return;
      setLive(null);
      onPreferences({ bandSize: { ...preferences.bandSize, [sized]: value } });
    },
    [onPreferences, preferences.bandSize, sized],
  );

  const reset = useCallback(() => {
    if (!sized) return;
    setLive(null);
    onPreferences({
      bandSize: {
        ...preferences.bandSize,
        [sized]: DEFAULT_PREFERENCES.bandSize[sized],
      },
    });
  }, [onPreferences, preferences.bandSize, sized]);

  const handle = sized ? (
    <SplitHandle
      edge={EDGE[sized]}
      value={size}
      containerRef={stageRef}
      onChange={setLive}
      onCommit={commit}
      onReset={reset}
      onDraggingChange={setDragging}
    />
  ) : null;

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

        `pointerEvents: none` durante o arrasto é reforço: a captura de ponteiro
        já mantém os eventos no divisor, mas sem isto o cursor pisca ao cruzar
        a borda do iframe.
      */}
      <iframe
        ref={frameRef}
        srcDoc={deck.html}
        title={`Slides: ${deck.name}`}
        data-deck-frame=""
        className="size-full border-0"
        style={{
          background: "#ffffff",
          colorScheme: "light",
          pointerEvents: dragging ? "none" : undefined,
        }}
        sandbox="allow-scripts allow-popups allow-forms allow-modals"
        allow="fullscreen"
      />
    </div>
  );

  if (layout === "hidden") {
    return (
      <main ref={stageRef} className="flex min-h-0 flex-1 flex-col" data-layout="hidden">
        {slides}
      </main>
    );
  }

  if (layout === "overlay") {
    return (
      <main
        ref={stageRef}
        className="relative flex min-h-0 flex-1 flex-col"
        data-layout="overlay"
      >
        {slides}
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col border-t border-border"
          style={{ height: `${size}%` }}
          data-caption-band=""
          data-caption-overlay=""
        >
          {handle}
          {captions}
        </div>
      </main>
    );
  }

  if (layout === "right") {
    return (
      <main ref={stageRef} className="flex min-h-0 flex-1 flex-row" data-layout="right">
        {slides}
        {handle}
        <div
          className="flex flex-none flex-col border-l border-border"
          style={{ width: `${size}%` }}
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
      style={{ height: `${size}%` }}
      data-caption-band=""
    >
      {captions}
    </div>
  );

  return (
    <main ref={stageRef} className="flex min-h-0 flex-1 flex-col" data-layout={layout}>
      {layout === "top" ? band : null}
      {layout === "top" ? handle : null}
      {slides}
      {layout === "bottom" ? handle : null}
      {layout === "bottom" ? band : null}
    </main>
  );
}
