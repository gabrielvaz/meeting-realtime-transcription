"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Maximize2, Minimize2 } from "lucide-react";

import { SplitHandle, type SplitEdge } from "@/components/SplitHandle";
import { TranslationDisplay } from "@/components/TranslationDisplay";
import { withResponsiveFit, type Deck } from "@/lib/deck";
import type { LanguageTrack } from "@/hooks/useRealtimeTranslation";
import type { SubtitleSnapshot } from "@/lib/subtitleBuffer";
import { DEFAULT_PREFERENCES, type ReadingPreferences } from "@/lib/transcriptLog";

type Layout = ReadingPreferences["captionLayout"];
type SizedLayout = Exclude<Layout, "hidden" | "only">;

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
  // Injetado uma vez por deck, não a cada render: mudar `srcDoc` recarrega o
  // documento e perderia o slide em que a pessoa está.
  const html = useMemo(() => withResponsiveFit(deck.html), [deck.html]);
  const [dragging, setDragging] = useState(false);
  /** Tamanho durante o arrasto; `null` quando vale o que está salvo. */
  const [live, setLive] = useState<number | null>(null);

  const layout = preferences.captionLayout;
  const focused = layout === "hidden" || layout === "only";
  const sized = focused ? null : (layout as SizedLayout);
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

  /**
   * Alterna entre o layout normal e um modo de foco, lembrando de onde veio.
   * Os slides continuam montados no modo "só legendas" — desmontar o iframe
   * recarregaria o deck e jogaria a pessoa de volta para o primeiro slide.
   */
  const focus = useCallback(
    (target: "hidden" | "only") => {
      onPreferences({
        captionLayout: layout === target ? preferences.previousLayout : target,
      });
    },
    [layout, onPreferences, preferences.previousLayout],
  );

  const focusButton = (
    target: "hidden" | "only",
    label: string,
    className: string,
  ) => (
    <button
      type="button"
      aria-label={layout === target ? "Sair da tela cheia" : label}
      title={layout === target ? "Sair da tela cheia" : label}
      data-focus={target}
      onClick={() => focus(target)}
      className={`absolute z-20 flex size-8 items-center justify-center rounded-sm border border-border bg-background/80 text-muted-foreground opacity-40 backdrop-blur transition hover:opacity-100 hover:text-foreground focus-visible:opacity-100 ${className}`}
    >
      {layout === target ? (
        <Minimize2 className="size-4" aria-hidden="true" />
      ) : (
        <Maximize2 className="size-4" aria-hidden="true" />
      )}
    </button>
  );

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

  /**
   * Estrutura única para todos os layouts, com chaves estáveis.
   *
   * Isto não é preferência de estilo: com uma árvore JSX por layout, o iframe
   * mudava de posição entre os filhos e o React o desmontava e remontava —
   * recarregando o deck e jogando quem apresenta de volta ao primeiro slide.
   * Com `key` fixa e uma só estrutura, ele nunca é recriado; o que muda é
   * apenas a classe e a direção do flex.
   */
  const slides = (
    <div
      key="slides"
      className={`relative min-h-0 min-w-0 flex-1 bg-background ${
        layout === "only" ? "hidden" : ""
      }`}
    >
      {focusButton("hidden", "Slides em tela cheia", "right-2 top-2")}
      {/*
        `srcDoc` em vez de um blob URL: sem objeto para criar, revogar ou vazar
        quando o usuário troca de arquivo no meio da apresentação. A origem
        opaca vem do `sandbox` sem `allow-same-origin`.

        Fundo branco e `colorScheme: light` fixos: um deck que não define o
        próprio fundo herdaria o canvas escuro do tema e ficaria com texto preto
        sobre preto. Não dá para reestilizar o documento do usuário — ele é de
        outra origem —, então garantimos o que o autor dele assumiu.

        `pointerEvents: none` durante o arrasto é reforço: a captura de ponteiro
        já mantém os eventos no divisor, mas sem isto o cursor pisca ao cruzar
        a borda do iframe.
      */}
      <iframe
        ref={frameRef}
        srcDoc={html}
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

  /**
   * A posição faz parte de cada variante, e não de um `relative` fixo: as duas
   * classes de posicionamento do Tailwind competem pela mesma propriedade e a
   * ordem no CSS gerado decide, não a ordem no atributo. Com `relative` fixo, a
   * faixa sobreposta voltava para o fluxo e encolhia os slides. `absolute` já
   * serve de referência para o botão de foco.
   */
  const BAND_CLASS: Record<Layout, string> = {
    bottom: "relative flex-none border-t border-border",
    top: "relative flex-none border-b border-border",
    right: "relative flex-none border-l border-border",
    overlay: "absolute inset-x-0 bottom-0 border-t border-border",
    only: "relative min-h-0 flex-1",
    hidden: "",
  };

  const bandStyle =
    layout === "right"
      ? { width: `${size}%` }
      : layout === "only"
        ? {}
        : { height: `${size}%` };

  const band =
    layout === "hidden" ? null : (
      <div
        key="band"
        className={`flex flex-col ${BAND_CLASS[layout]}`}
        style={bandStyle}
        data-caption-band=""
        data-caption-overlay={layout === "overlay" ? "" : undefined}
      >
        {focusButton("only", "Legendas em tela cheia", "right-2 top-2")}
        {layout === "overlay" ? handle : null}
        {captions}
      </div>
    );

  const MAIN_CLASS: Record<Layout, string> = {
    // `flex-col-reverse` põe a faixa em cima sem trocar a ordem dos filhos.
    bottom: "flex flex-col",
    top: "flex flex-col-reverse",
    right: "flex flex-row",
    overlay: "relative flex flex-col",
    only: "flex flex-col",
    hidden: "flex flex-col",
  };

  return (
    <main
      ref={stageRef}
      className={`min-h-0 flex-1 ${MAIN_CLASS[layout]}`}
      data-layout={layout}
    >
      {slides}
      {layout === "overlay" ? null : handle}
      {band}
    </main>
  );
}
