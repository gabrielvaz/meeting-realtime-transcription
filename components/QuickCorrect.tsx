"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { newEntryId, type GlossaryEntry } from "@/lib/glossary";

/** Seleção maior que isto é frase, não termo. */
const MAX_SELECTION = 40;

interface QuickCorrectProps {
  glossary: GlossaryEntry[];
  onChange: (entries: GlossaryEntry[]) => void;
}

/**
 * Corrigir um termo direto da legenda, selecionando a palavra errada.
 *
 * Existe porque prever as variantes é impossível para termos que o modelo ouve
 * mal: em três testes com a mesma frase, "Holter" saiu como Router, Hotter,
 * Alterna, Alten e Euter — palavras diferentes a cada vez. Nenhuma lista dá
 * conta disso por antecipação. O que dá é capturar o erro no instante em que
 * ele aparece na tela.
 *
 * A caixa da seleção é preservada de propósito: o modelo capitaliza o que
 * entende como nome próprio, e variante capitalizada só casa capitalizada —
 * então adicionar "Router" corrige o nome sem estragar "o router do escritório".
 */
export function QuickCorrect({ glossary, onChange }: QuickCorrectProps) {
  const [selection, setSelection] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    const handler = () => {
      const raw = window.getSelection()?.toString().trim() ?? "";
      const inside =
        window.getSelection()?.anchorNode instanceof Node &&
        (window.getSelection()!.anchorNode as Node).parentElement?.closest(".stage");
      setSelection(raw && raw.length <= MAX_SELECTION && inside ? raw : "");
    };
    document.addEventListener("mouseup", handler);
    document.addEventListener("touchend", handler);
    return () => {
      document.removeEventListener("mouseup", handler);
      document.removeEventListener("touchend", handler);
    };
  }, []);

  if (!selection) return null;

  const alreadyKnown = glossary.some((entry) =>
    entry.variants.some((variant) => variant === selection),
  );

  const add = () => {
    if (!target) return;
    onChange(
      glossary.some((entry) => entry.term === target)
        ? glossary.map((entry) =>
            entry.term === target
              ? { ...entry, variants: [...entry.variants, selection] }
              : entry,
          )
        : [...glossary, { id: newEntryId(), term: target, variants: [selection] }],
    );
    setSelection("");
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 border-t border-border bg-background px-5 py-3 text-xs"
      data-quick-correct=""
    >
      <span className="text-muted-foreground">Corrigir</span>
      <code className="rounded-sm border border-border px-2 py-1 font-mono text-sm">
        {selection}
      </code>
      {alreadyKnown ? (
        <span className="text-muted-foreground">já está no dicionário</span>
      ) : (
        <>
          <span className="text-muted-foreground">para</span>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="h-8 w-52" data-quick-target="">
              <SelectValue placeholder="Escolha o termo certo" />
            </SelectTrigger>
            <SelectContent>
              {glossary.map((entry) => (
                <SelectItem key={entry.id} value={entry.term}>
                  {entry.term}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" disabled={!target} onClick={add}>
            Adicionar ao dicionário
          </Button>
        </>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={() => {
          setSelection("");
          window.getSelection()?.removeAllRanges();
        }}
      >
        Fechar
      </Button>
    </div>
  );
}
