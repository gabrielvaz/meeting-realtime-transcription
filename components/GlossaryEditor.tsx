"use client";

import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_GLOSSARY,
  applyGlossary,
  compileGlossary,
  newEntryId,
  parseVariants,
  type GlossaryEntry,
} from "@/lib/glossary";

const SAMPLE_TEXT =
  "O exame de holder foi feito no cardio line, e o e c g da cardius ficou bom.";

interface GlossaryEditorProps {
  entries: GlossaryEntry[];
  onChange: (entries: GlossaryEntry[]) => void;
}

export function GlossaryEditor({ entries, onChange }: GlossaryEditorProps) {
  const [term, setTerm] = useState("");
  const [variants, setVariants] = useState("");
  const [sample, setSample] = useState(SAMPLE_TEXT);

  const compiled = useMemo(() => compileGlossary(entries), [entries]);
  const missingDefaults = useMemo(() => {
    const known = new Set(entries.map((entry) => entry.term.trim().toLowerCase()));
    return DEFAULT_GLOSSARY.filter((entry) => !known.has(entry.term.toLowerCase()));
  }, [entries]);
  const corrected = useMemo(
    () => applyGlossary(sample, compiled),
    [sample, compiled],
  );

  const add = () => {
    const cleanTerm = term.trim();
    const cleanVariants = parseVariants(variants);
    if (!cleanTerm || !cleanVariants.length) return;
    onChange([
      ...entries,
      { id: newEntryId(), term: cleanTerm, variants: cleanVariants },
    ]);
    setTerm("");
    setVariants("");
  };

  const update = (id: string, patch: Partial<GlossaryEntry>) => {
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };

  const remove = (id: string) => onChange(entries.filter((entry) => entry.id !== id));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        A API de tradução{" "}
        <strong className="font-medium text-foreground">não aceita glossário</strong> —
        não há como ensinar o termo certo ao modelo. Este dicionário corrige o texto
        depois que ele chega, tanto na transcrição original quanto nas traduções.
        Funciona para a forma escrita da palavra; não conserta uma frase que o modelo
        entendeu errado por inteiro.
      </p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Tudo aqui fica só no <code className="font-mono">localStorage</code> deste
        navegador. Termos removidos não voltam sozinhos numa versão futura.
      </p>

      <div className="flex flex-col divide-y divide-border rounded-sm border border-border">
        {entries.length === 0 ? (
          <p className="p-4 text-[13px] text-muted-foreground">
            Nenhum termo. O dicionário está desligado.
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-2 p-4" data-glossary={entry.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Forma correta"
                  className="h-8 w-40 text-sm font-medium"
                  value={entry.term}
                  onChange={(event) => update(entry.id, { term: event.target.value })}
                />
                <span className="text-xs text-muted-foreground">corrige</span>
                <Input
                  aria-label={`Variantes de ${entry.term}`}
                  className="h-8 min-w-[200px] flex-1 text-sm"
                  value={entry.variants.join(", ")}
                  onChange={(event) =>
                    update(entry.id, { variants: parseVariants(event.target.value) })
                  }
                />
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      Remover
                    </Button>
                  }
                  title={`Remover "${entry.term}" do dicionário?`}
                  description="O termo deixa de ser corrigido nas próximas transcrições."
                  confirmLabel="Remover"
                  onConfirm={() => remove(entry.id)}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
          Adicionar termo
        </Label>
        <div className="flex flex-wrap gap-2">
          <Input
            className="h-9 w-40 text-sm"
            placeholder="Forma correta"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
          <Input
            className="h-9 min-w-[200px] flex-1 text-sm"
            placeholder="Como costuma sair errado, separado por vírgula"
            value={variants}
            onChange={(event) => setVariants(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
            }}
          />
          <Button onClick={add} disabled={!term.trim() || !variants.trim()}>
            Adicionar
          </Button>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Acento e espaçamento são ignorados na comparação: <code className="font-mono">e c g</code>{" "}
          também casa <code className="font-mono">E-C-G</code>. Evite variantes que sejam
          palavras legítimas — corrigir <code className="font-mono">voltar</code> para
          Holter estragaria o verbo.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-5">
        <Label
          htmlFor="glossary-sample"
          className="text-xs uppercase tracking-[0.1em] text-muted-foreground"
        >
          Testar
        </Label>
        <Input
          id="glossary-sample"
          className="text-sm"
          value={sample}
          onChange={(event) => setSample(event.target.value)}
        />
        <p
          className="rounded-sm border border-border px-3 py-2 text-sm leading-relaxed"
          data-glossary-preview=""
        >
          {corrected}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={missingDefaults.length === 0}
          onClick={() => onChange([...entries, ...missingDefaults])}
        >
          {missingDefaults.length
            ? `Restaurar ${missingDefaults.length} termo${missingDefaults.length === 1 ? "" : "s"} padrão`
            : "Todos os termos padrão estão na lista"}
        </Button>
        {entries.length ? (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" className="h-8 text-xs">
                Apagar tudo
              </Button>
            }
            title="Apagar o dicionário inteiro?"
            description={`Os ${entries.length} termos serão removidos deste navegador. Nenhuma correção será aplicada.`}
            confirmLabel="Apagar tudo"
            onConfirm={() => onChange([])}
          />
        ) : null}
      </div>
    </div>
  );
}
