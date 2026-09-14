"use client";

import { useCallback, useRef, useState, type RefObject } from "react";

/** Limites em porcentagem do palco. Fora disso não sobra nem slide nem legenda. */
export const BAND_MIN = 8;
export const BAND_MAX = 80;

export type SplitEdge = "bottom" | "top" | "right";

interface SplitHandleProps {
  /** De que lado do palco fica a faixa de legendas. */
  edge: SplitEdge;
  /** Tamanho atual, em porcentagem. */
  value: number;
  /** Durante o arrasto, a cada movimento. */
  onChange: (value: number) => void;
  /** Ao soltar — é aqui que grava, não a cada pixel. */
  onCommit: (value: number) => void;
  /** Volta ao padrão com duplo clique. */
  onReset: () => void;
  containerRef: RefObject<HTMLElement | null>;
  /** Desliga os eventos de ponteiro dos slides durante o arrasto. */
  onDraggingChange: (dragging: boolean) => void;
}

const clamp = (value: number) => Math.min(BAND_MAX, Math.max(BAND_MIN, value));

/**
 * Divisor arrastável entre os slides e as legendas.
 *
 * Dois detalhes que fazem a diferença entre funcionar e quase funcionar:
 *
 * - `setPointerCapture`: sem isso o ponteiro entra no iframe dos slides no
 *   primeiro pixel de arrasto e os eventos somem — o documento de dentro é de
 *   outra origem e fica com eles. Com captura, o handle continua recebendo.
 * - Gravação só no `pointerup`. Gravar a cada movimento escreveria no
 *   `localStorage` dezenas de vezes por segundo.
 *
 * Também responde ao teclado: é o que torna o ajuste fino possível e o que dá
 * acesso a quem não usa mouse.
 */
export function SplitHandle({
  edge,
  value,
  onChange,
  onCommit,
  onReset,
  containerRef,
  onDraggingChange,
}: SplitHandleProps) {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(value);

  const measure = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const px =
        edge === "bottom"
          ? rect.bottom - clientY
          : edge === "top"
            ? clientY - rect.top
            : rect.right - clientX;
      const total = edge === "right" ? rect.width : rect.height;
      if (total <= 0) return null;
      return clamp((px / total) * 100);
    },
    [containerRef, edge],
  );

  const vertical = edge === "right";

  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label="Redimensionar a área das legendas"
      aria-valuenow={Math.round(value)}
      aria-valuemin={BAND_MIN}
      aria-valuemax={BAND_MAX}
      tabIndex={0}
      data-split-handle={edge}
      data-dragging={dragging ? "" : undefined}
      className={`group relative z-10 flex-none touch-none ${
        vertical ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize"
      }`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        onDraggingChange(true);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        const next = measure(event.clientX, event.clientY);
        if (next === null) return;
        latest.current = next;
        onChange(next);
      }}
      onPointerUp={(event) => {
        if (!dragging) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
        onDraggingChange(false);
        onCommit(latest.current);
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const keys = vertical
          ? { less: "ArrowRight", more: "ArrowLeft" }
          : { less: edge === "bottom" ? "ArrowDown" : "ArrowUp", more: edge === "bottom" ? "ArrowUp" : "ArrowDown" };
        const step = event.shiftKey ? 5 : 2;
        let next: number | null = null;
        if (event.key === keys.more) next = clamp(value + step);
        if (event.key === keys.less) next = clamp(value - step);
        if (next === null) return;
        event.preventDefault();
        latest.current = next;
        onChange(next);
        onCommit(next);
      }}
    >
      {/* Linha fina sempre visível; engrossa ao passar o mouse ou arrastar. */}
      <span
        aria-hidden="true"
        className={`absolute bg-border transition-colors group-hover:bg-muted-foreground group-focus-visible:bg-foreground group-data-[dragging]:bg-foreground ${
          vertical ? "inset-y-0 left-1/2 w-px -translate-x-1/2" : "inset-x-0 top-1/2 h-px -translate-y-1/2"
        }`}
      />
    </div>
  );
}
