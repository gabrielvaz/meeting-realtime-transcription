"use client";

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DeckError, formatBytes, readDeckFile, type Deck } from "@/lib/deck";

interface DeckPickerProps {
  deck: Deck | null;
  onDeck: (deck: Deck | null) => void;
}

/** Seleção do HTML dos slides, por botão ou arrastando o arquivo. */
export function DeckPicker({ deck, onDeck }: DeckPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      try {
        onDeck(await readDeckFile(file));
      } catch (caught) {
        setError(
          caught instanceof DeckError ? caught.message : "Não foi possível ler o arquivo.",
        );
      }
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

      <p className="text-[13px] leading-relaxed text-muted-foreground">
        O arquivo fica só na memória deste navegador — não é enviado a servidor
        nenhum. Ele roda isolado: os scripts dos slides funcionam, mas o documento
        não enxerga a sua chave da OpenAI nem o resto da aplicação.
      </p>
    </div>
  );
}
