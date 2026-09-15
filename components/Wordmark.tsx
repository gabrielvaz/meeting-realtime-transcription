/**
 * A marca da Cardioline, na cor original de cada versão do arquivo.
 *
 * São dois arquivos do próprio acervo da marca — laranja `#F66201` e branco —
 * e a troca é feita em CSS pela classe `dark` que o tema já põe na raiz. Não
 * por estado de React de propósito: o tema é aplicado por um script inline
 * antes da primeira pintura, então a marca certa já aparece na primeira
 * renderização, sem trocar de cor na frente de quem está olhando. Isso também
 * cobre o tema "Sistema", que só resolve para claro ou escuro no navegador.
 *
 * O `basePath` entra na mão porque o Next não reescreve `src` de `<img>` — no
 * GitHub Pages o caminho é `/meeting-realtime-transcription/…`.
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
  const size = { height, width: height * RATIO };
  const common = `wordmark block ${className}`;

  // `<img>` e não `next/image`: é um SVG de tamanho fixo, não há o que
  // otimizar, e o componente do Next só acrescentaria wrapper e configuração.
  return (
    <span data-wordmark="" className={`block ${className}`} style={size}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${BASE}/cardioline-wordmark.svg`}
        alt="Cardioline"
        width={Math.round(size.width)}
        height={height}
        className={`${common} wordmark-light`}
        style={size}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${BASE}/cardioline-wordmark-white.svg`}
        alt="Cardioline"
        width={Math.round(size.width)}
        height={height}
        className={`${common} wordmark-dark`}
        style={size}
      />
    </span>
  );
}
