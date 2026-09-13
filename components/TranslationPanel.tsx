"use client";

import { useEffect, useRef } from "react";

import { getLanguage } from "@/lib/languages";
import type { LanguageTrack } from "@/hooks/useRealtimeTranslation";
import type { SessionStatus } from "@/types/realtime";

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
  /** A transcrição da origem está recebendo deltas agora? */
  sourceActive: boolean;
  paused: boolean;
}

export function TranslationPanel({
  track,
  sourceActive,
  paused,
}: TranslationPanelProps) {
  const language = getLanguage(track.language);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const statusLabel = STATUS_LABEL[track.status];

  /**
   * Acompanha o texto novo, mas solta o controle se a pessoa rolar para cima
   * para reler algo — reancorar à força no fim seria brigar com quem está lendo.
   */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !pinnedRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [track.subtitle.revision]);

  /**
   * Reancora quando o painel muda de tamanho.
   *
   * Trocar a organização do grid, o tamanho da fonte ou reexibir um idioma
   * altera a altura do painel: o conteúdo continua onde estava e o fim sai da
   * vista, até chegar o próximo delta. Num silêncio, isso pode durar bastante —
   * e parece que a legenda travou.
   */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /**
   * Só gesto do usuário desancora.
   *
   * Escutar `scroll` puro não serve: mudar a organização do grid, o tamanho da
   * fonte ou reexibir um idioma altera a altura do conteúdo e dispara `scroll`
   * sem ninguém ter rolado nada. Isso desancorava a legenda para sempre e o
   * texto novo parava de aparecer — o bug que parecia "o texto some da tela".
   */
  const checkPinned = () => {
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      const distanceFromBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight;
      pinnedRef.current = distanceFromBottom < 48;
    });
  };

  const { segments, current } = track.subtitle;
  const empty = segments.length === 0 && !current;
  const connected = track.status === "connected" || paused;

  /**
   * O modelo evita traduzir fala que já está no idioma de saída, e nesse caso
   * simplesmente não emite nada. Se a origem está sendo transcrita e esta
   * sessão continua vazia, é quase certo que é isso.
   */
  const likelySameLanguage = connected && empty && sourceActive;

  return (
    <section
      className="panel flex min-h-0 min-w-0 flex-col bg-background px-4 pb-5 pt-[18px] sm:px-6 lg:px-10"
      lang={language.htmlLang}
      data-panel={track.language}
    >
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
      </div>

      {/* Nada some: o texto antigo continua na tela e a área rola. O trecho
          sendo falado fica preto; tudo o que já fechou, cinza. */}
      <div
        className="panel-body flex min-h-0 flex-1 flex-col gap-[0.4em] overflow-y-auto pb-[0.25em] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        ref={scrollRef}
        onWheel={checkPinned}
        onTouchMove={checkPinned}
        onKeyDown={checkPinned}
      >
        {segments.map((segment, index) => (
          <p key={index} className="caption is-past">
            {segment}
          </p>
        ))}
        {current ? <p className="caption is-current">{current}</p> : null}
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
