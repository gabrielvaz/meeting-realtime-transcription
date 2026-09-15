/**
 * A marca da Cardioline, na cor original do arquivo (#F66201).
 *
 * Renderizada como `<img>` e não como máscara CSS justamente por isso: a
 * máscara descartava as cores do arquivo e pintava a marca com a cor do tema.
 * Aqui o SVG é desenhado como foi desenhado, em qualquer tema.
 *
 * O `basePath` precisa entrar na mão porque o Next não reescreve `src` de
 * `<img>` — no GitHub Pages o caminho é `/meeting-realtime-transcription/…`.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Proporção do wordmark: viewBox 600 × 38. */
const RATIO = 600 / 38;

export function Wordmark({
  height = 11,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  // `<img>` e não `next/image`: é um SVG de tamanho fixo, não há o que
  // otimizar, e o componente do Next só acrescentaria wrapper e configuração.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${BASE}/cardioline-wordmark.svg`}
      alt="Cardioline"
      data-wordmark=""
      width={Math.round(height * RATIO)}
      height={height}
      className={`wordmark block ${className}`}
      style={{ height, width: height * RATIO }}
    />
  );
}
