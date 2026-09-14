"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { DeckError, formatBytes, readDeckFile, type Deck } from "@/lib/deck";
import {
  deleteDeck,
  formatSavedAt,
  listDecks,
  loadDeck,
  saveDeck,
  type DeckSummary,
} from "@/lib/deckStore";

interface DeckPickerProps {
  deck: Deck | null;
  onDeck: (deck: Deck | null) => void;
}

/** Escolha do HTML dos slides: arquivo novo ou uma apresentação já guardada. */
export function DeckPicker({ deck, onDeck }: DeckPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<DeckSummary[]>([]);

  const refresh = useCallback(() => {
    void listDecks().then(setSaved);
  }, []);

  useEffect(() => {
    queueMicrotask(refresh);
  }, [refresh]);

  const load = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      try {
        const next = await readDeckFile(file);
        onDeck(next);
        // Guardar é o comportamento esperado: quem sobe um deck quer reusá-lo.
        await saveDeck(next);
        refresh();
      } catch (caught) {
        setError(
          caught instanceof DeckError ? caught.message : "Não foi possível ler o arquivo.",
        );
      }
    },
    [onDeck, refresh],
  );

  const reuse = useCallback(
    async (id: string) => {
      const stored = await loadDeck(id);
      if (stored) onDeck(stored);
      else setError("Esta apresentação não está mais guardada.");
    },
    [onDeck],
  );

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
        Slides
      </span>

      <div
        className={`flex flex-wrap items-center gap-3 rounded-sm border border-dashed p-4 ${
          dragging ? "border-foreground bg-muted" : "border-border"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void load(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".html,.htm,.xhtml,text/html"
          className="hidden"
          data-deck-input=""
          onChange={(event) => void load(event.target.files?.[0])}
        />
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          {deck ? "Trocar arquivo" : "Escolher arquivo HTML"}
        </Button>
        {deck ? (
          <>
            <span className="text-sm" data-deck-name="">
              {deck.name}
            </span>
            <span className="text-xs text-muted-foreground">{formatBytes(deck.bytes)}</span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 text-xs"
              onClick={() => onDeck(null)}
            >
              Remover
            </Button>
          </>
        ) : (
          <span className="text-[13px] text-muted-foreground">
            ou arraste o arquivo aqui
          </span>
        )}
      </div>

      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}

      {saved.length ? (
        <div className="flex flex-col gap-2 pt-1">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Guardadas neste navegador
          </span>
          <div className="flex flex-col divide-y divide-border rounded-sm border border-border">
            {saved.map((item) => (
              <div
                key={item.id}
                data-saved-deck={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
              >
                <span className="text-sm">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(item.bytes)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatSavedAt(item.savedAt)}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    data-reuse-deck={item.id}
                    onClick={() => void reuse(item.id)}
                  >
                    Usar
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        Apagar
                      </Button>
                    }
                    title={`Apagar "${item.name}"?`}
                    description="A apresentação será removida deste navegador. Não dá para desfazer."
                    confirmLabel="Apagar"
                    onConfirm={() => {
                      void deleteDeck(item.id).then(refresh);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-[13px] leading-relaxed text-muted-foreground">
        As apresentações ficam guardadas neste navegador para reutilizar depois —
        nada é enviado a servidor nenhum. Elas rodam isoladas: os scripts dos
        slides funcionam, mas o documento não enxerga a sua chave da OpenAI nem o
        resto da aplicação.
      </p>
    </div>
  );
}
