/**
 * A marca da Cardioline, discreta.
 *
 * Desenhada com `mask-image` em vez de `<img>` ou SVG embutido: a máscara usa
 * só o canal alfa do arquivo, então a cor vem de `background-color` e a marca
 * acompanha o tema sozinha — clara no escuro, laranja nos temas Cardioline.
 * Um `<img>` não herdaria cor nenhuma, e embutir o traçado custaria 7 kB de
 * bundle em vez de um arquivo cacheado.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SOURCE = `url(${BASE}/cardioline-wordmark.svg)`;

export function Wordmark({
  height = 11,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Cardioline"
      data-wordmark=""
      className={`wordmark block ${className}`}
      style={{
        height,
        // O wordmark tem proporção 600 × 38.
        width: height * (600 / 38),
        WebkitMaskImage: SOURCE,
        maskImage: SOURCE,
      }}
    />
  );
}
