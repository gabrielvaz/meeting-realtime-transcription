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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
