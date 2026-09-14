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
    const pin = () => {
      node.scrollTop = node.scrollHeight;
    };
    pin();
    // De novo no quadro seguinte: o efeito roda logo após o commit, e com flex
    // mais container queries a altura final às vezes só sai numa segunda
    // passada de layout. Sem isto a legenda para alguns pixels antes do fim
    // depois de trocar organização, fonte ou quantidade de idiomas.
    const frame = requestAnimationFrame(pin);
    return () => cancelAnimationFrame(frame);
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
  const checkPinned = (cause: string) => {
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      const distanceFromBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight;
      const next = distanceFromBottom < 48;
      if (next !== pinnedRef.current) {
        console.debug(
          `[caption:${track.language}] ancoragem ${next ? "retomada" : "solta"} por ${cause} (${Math.round(distanceFromBottom)}px do fim)`,
        );
      }
      pinnedRef.current = next;
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

  const emptyLabel =
    empty && connected
      ? paused
        ? "Pausado"
        : likelySameLanguage
          ? `sem tradução: o modelo não traduz fala que já está em ${language.label}`
          : "Aguardando fala"
      : null;

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
        {/* O aviso de vazio fica ao lado do nome do idioma: numa faixa baixa,
            uma linha a mais no corpo custa uma linha de legenda. */}
        {emptyLabel ? (
          <span
            className="panel-empty min-w-0 truncate text-[11px] tracking-[0.04em] text-muted-foreground/70"
            title={emptyLabel}
          >
            {emptyLabel}
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
        onWheel={() => checkPinned("roda do mouse")}
        onTouchMove={() => checkPinned("toque")}
        onKeyDown={() => checkPinned("teclado")}
      >
        {segments.map((segment, index) => (
          <p key={index} className="caption is-past">
            {segment}
          </p>
        ))}
        {current ? <p className="caption is-current">{current}</p> : null}
      </div>
    </section>
  );
}
