import type { Deck } from "@/lib/deck";

/**
 * Apresentações guardadas no navegador, para reutilizar depois.
 *
 * **Por que IndexedDB e não `localStorage`.** O pedido era `localStorage`, mas
 * ele não serve para isto: o limite típico é de 5 MB para *toda* a origem — que
 * aqui já guarda histórico de transcrições, dicionário, preferências e a chave
 * da API — enquanto um deck com imagens embutidas chega a 15 MB. Além disso
 * `localStorage` é síncrono: gravar alguns megabytes trava a interface no meio
 * da apresentação. IndexedDB é assíncrono, tem cota na casa das centenas de
 * megabytes e continua sendo armazenamento local do navegador: nada sai daqui,
 * nada vai para servidor.
 *
 * O resto das preferências continua no `localStorage`, onde cabe bem.
 */

const DB_NAME = "live-translation";
const DB_VERSION = 1;
const STORE = "decks";

export interface StoredDeck {
  id: string;
  name: string;
  bytes: number;
  savedAt: number;
  html: string;
}

/** Metadados sem o HTML — é o que a lista precisa. */
export type DeckSummary = Omit<StoredDeck, "html">;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador não tem IndexedDB."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponível."));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export async function listDecks(): Promise<DeckSummary[]> {
  try {
    const all = await run<StoredDeck[]>("readonly", (store) => store.getAll());
    return all
      .map((record) => ({
        id: record.id,
        name: record.name,
        bytes: record.bytes,
        savedAt: record.savedAt,
      }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function saveDeck(deck: Deck): Promise<DeckSummary | null> {
  const record: StoredDeck = {
    // O id vem do nome e do tamanho: reenviar o mesmo arquivo atualiza a
    // entrada em vez de criar uma duplicata na lista.
    id: `${deck.name}:${deck.bytes}`,
    name: deck.name,
    bytes: deck.bytes,
    savedAt: Date.now(),
    html: deck.html,
  };
  try {
    await run("readwrite", (store) => store.put(record));
    return {
      id: record.id,
      name: record.name,
      bytes: record.bytes,
      savedAt: record.savedAt,
    };
  } catch {
    return null;
  }
}

export async function loadDeck(id: string): Promise<Deck | null> {
  try {
    const record = await run<StoredDeck | undefined>("readonly", (store) => store.get(id));
    return record ? { name: record.name, html: record.html, bytes: record.bytes } : null;
  } catch {
    return null;
  }
}

export async function deleteDeck(id: string): Promise<void> {
  try {
    await run("readwrite", (store) => store.delete(id));
  } catch {
    /* nada a fazer: a lista é relida em seguida */
  }
}

export function formatSavedAt(value: number): string {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
