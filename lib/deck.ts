/**
 * Carregamento do HTML de apresentação.
 *
 * O arquivo do usuário roda dentro de um `<iframe>` com
 * `sandbox="allow-scripts"` e **sem** `allow-same-origin`. Essa combinação dá
 * ao documento uma **origem opaca**: os scripts dos slides funcionam (reveal.js,
 * animações, navegação por teclado), mas o documento não consegue ler o
 * `localStorage` desta aplicação — onde mora a chave da OpenAI — nem tocar no
 * DOM da página, nem navegar a janela de topo.
 *
 * Sem `allow-scripts` os slides não passariam de HTML estático. Com
 * `allow-same-origin` junto, o sandbox seria inútil: as duas flags combinadas
 * devolvem ao documento acesso total à origem que o hospeda.
 *
 * O arquivo fica só em memória. Nada é enviado para servidor nenhum e nada é
 * gravado em disco.
 */

/**
 * O HTML é injetado via `srcDoc`, ou seja, vira atributo no DOM. Acima deste
 * tamanho o custo de memória e de parse começa a pesar na apresentação.
 */
const MAX_BYTES = 15 * 1024 * 1024;

export interface Deck {
  name: string;
  html: string;
  bytes: number;
}

export class DeckError extends Error {}

export async function readDeckFile(file: File): Promise<Deck> {
  const looksHtml =
    file.type.includes("html") || /\.x?html?$/i.test(file.name);
  if (!looksHtml) {
    throw new DeckError("Escolha um arquivo .html.");
  }
  if (file.size > MAX_BYTES) {
    throw new DeckError(
      `O arquivo tem ${formatBytes(file.size)}. O limite é ${formatBytes(MAX_BYTES)}.`,
    );
  }

  const html = await file.text();
  if (!html.trim()) throw new DeckError("O arquivo está vazio.");

  return { name: file.name, html, bytes: file.size };
}

/**
 * Faz o deck caber no contêiner que o exibe.
 *
 * Um iframe já tem viewport próprio, então `vw`, `vh` e media queries do deck
 * respondem ao tamanho do contêiner sozinhos — decks responsivos funcionam sem
 * ajuda. O que quebra é o deck de largura fixa (`width: 1280px`), comum em
 * apresentação: ele estoura e fica cortado quando a faixa de legendas ocupa
 * metade da tela.
 *
 * O script injetado só **reduz**, nunca amplia, e só no eixo horizontal —
 * encolher pela altura esmagaria um deck de rolagem longa. `zoom` em vez de
 * `transform: scale()` porque mantém o layout e a rolagem coerentes, sem
 * precisar de wrapper (que quebraria scripts que consultam `document.body`).
 *
 * O CSS é conservador de propósito: só impede mídia de vazar. Reescrever o
 * estilo de quem fez o deck seria pior que o problema.
 */
const FIT_SNIPPET = `
<style data-live-translation-fit>
  img, svg, video, canvas, iframe, table { max-width: 100%; }
  img, video { height: auto; }
  html { overflow-x: hidden; }
</style>
<script data-live-translation-fit>
(function () {
  var root = document.documentElement;
  var busy = false;
  function fit() {
    if (busy) return;
    busy = true;
    root.style.zoom = "1";
    requestAnimationFrame(function () {
      var natural = root.scrollWidth;
      var available = root.clientWidth;
      var ratio = available / Math.max(natural, 1);
      root.style.zoom = ratio < 0.995 ? String(Math.max(ratio, 0.25)) : "1";
      busy = false;
    });
  }
  if (document.readyState === "complete") fit();
  else window.addEventListener("load", fit);
  window.addEventListener("resize", fit);
  setTimeout(fit, 400);
})();
</script>
`;

/** Injeta o ajuste antes de `</body>`, ou no fim se não houver. */
export function withResponsiveFit(html: string): string {
  const closing = html.lastIndexOf("</body>");
  if (closing === -1) return html + FIT_SNIPPET;
  return html.slice(0, closing) + FIT_SNIPPET + html.slice(closing);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
