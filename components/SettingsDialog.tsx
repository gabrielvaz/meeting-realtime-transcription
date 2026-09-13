"use client";

import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { GlossaryEditor } from "@/components/GlossaryEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GlossaryEntry } from "@/lib/glossary";
import { mintClientSecret } from "@/lib/openai/clientSecret";
import {
  clearApiKey,
  looksLikeApiKey,
  maskApiKey,
  readApiKey,
  writeApiKey,
} from "@/lib/apiKey";

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

interface SettingsDialogProps {
  trigger: React.ReactNode;
  glossary: GlossaryEntry[];
  onGlossaryChange: (entries: GlossaryEntry[]) => void;
  onKeyChange?: (hasKey: boolean) => void;
}

export function SettingsDialog({
  trigger,
  glossary,
  onGlossaryChange,
  onKeyChange,
}: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  const handleOpenChange = useCallback((next: boolean) => {
    if (next) {
      setSavedKey(readApiKey());
      setDraft("");
      setTest({ kind: "idle" });
    }
    setOpen(next);
  }, []);

  const save = useCallback(() => {
    const value = draft.trim();
    if (!value) return;
    writeApiKey(value);
    setSavedKey(value);
    setDraft("");
    setTest({ kind: "idle" });
    onKeyChange?.(true);
  }, [draft, onKeyChange]);

  const remove = useCallback(() => {
    clearApiKey();
    setSavedKey(null);
    setTest({ kind: "idle" });
    onKeyChange?.(false);
  }, [onKeyChange]);

  /**
   * Cria um client secret e descarta. Verifica de uma vez a chave, o acesso ao
   * modelo e a conectividade — e criar um segredo não custa nada, porque a
   * cobrança é por minuto de áudio.
   */
  const runTest = useCallback(async () => {
    const key = draft.trim() || savedKey;
    if (!key) return;
    setTest({ kind: "testing" });
    try {
      // Cria um segredo e descarta. Criar não custa nada — a cobrança é por
      // minuto de áudio — e valida chave, saldo e acesso ao modelo de uma vez.
      await mintClientSecret({ targetLanguage: "pt", apiKey: key });
      setTest({ kind: "ok" });
    } catch (error) {
      setTest({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [draft, savedKey]);

  const malformed = draft.trim().length > 0 && !looksLikeApiKey(draft);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88dvh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border p-6 pb-4">
          <DialogTitle className="text-sm font-semibold uppercase tracking-[0.12em]">
            Configurar
          </DialogTitle>
          <DialogDescription>
            Chave da OpenAI e como esta aplicação funciona.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="key" className="gap-0">
          <TabsList className="mx-6 mt-4 w-[calc(100%-3rem)]">
            <TabsTrigger value="key" className="flex-1">
              Chave da API
            </TabsTrigger>
            <TabsTrigger value="glossary" className="flex-1" data-tab="glossary">
              Dicionário
            </TabsTrigger>
            <TabsTrigger value="how" className="flex-1">
              Como funciona
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="max-h-[58dvh]">
            <TabsContent value="key" className="m-0 flex flex-col gap-5 p-6">
              {savedKey ? (
                <div className="flex flex-wrap items-center gap-3 rounded-sm border border-border px-4 py-3">
                  <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    Chave salva
                  </span>
                  <code className="font-mono text-sm">{maskApiKey(savedKey)}</code>
                  <div className="ml-auto flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => void runTest()}
                      disabled={test.kind === "testing"}
                    >
                      {test.kind === "testing" ? "Testando…" : "Testar"}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          Remover
                        </Button>
                      }
                      title="Remover a chave salva?"
                      description="A chave será apagada deste navegador. Você precisará colá-la de novo para traduzir."
                      confirmLabel="Remover"
                      onConfirm={remove}
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <Label htmlFor="api-key" className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  {savedKey ? "Substituir por outra chave" : "Sua chave da OpenAI"}
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="api-key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="sk-proj-…"
                    className="min-w-[240px] flex-1 font-mono text-sm"
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setTest({ kind: "idle" });
                    }}
                  />
                  <Button onClick={save} disabled={!draft.trim() || malformed}>
                    Salvar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void runTest()}
                    disabled={!draft.trim() || malformed || test.kind === "testing"}
                  >
                    {test.kind === "testing" ? "Testando…" : "Testar"}
                  </Button>
                </div>

                {malformed ? (
                  <p className="text-[13px] text-destructive">
                    Isso não parece uma chave da OpenAI. Elas começam com{" "}
                    <code className="font-mono">sk-</code>.
                  </p>
                ) : null}
                {test.kind === "ok" ? (
                  <p className="text-[13px] text-foreground">
                    Chave válida e com acesso a <code className="font-mono">gpt-realtime-translate</code>.
                  </p>
                ) : null}
                {test.kind === "error" ? (
                  <p className="text-[13px] text-destructive">{test.message}</p>
                ) : null}
              </div>

              <section className="flex flex-col gap-2 border-t border-border pt-5">
                <h3 className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  Como conseguir a chave
                </h3>
                <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-muted-foreground">
                  <li>
                    Entre em{" "}
                    <a
                      className="text-foreground underline underline-offset-2"
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noreferrer"
                    >
                      platform.openai.com/api-keys
                    </a>{" "}
                    com a sua conta OpenAI. É a plataforma de API, não o ChatGPT: uma
                    assinatura do ChatGPT Plus não dá acesso à API.
                  </li>
                  <li>
                    Adicione crédito em{" "}
                    <a
                      className="text-foreground underline underline-offset-2"
                      href="https://platform.openai.com/settings/organization/billing"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Billing
                    </a>
                    . Sem saldo, a chave existe mas toda chamada falha.
                  </li>
                  <li>
                    Clique em <em>Create new secret key</em>, copie o valor e cole aqui.
                    A OpenAI mostra a chave uma única vez.
                  </li>
                  <li>
                    Use <em>Testar</em> acima: ele confirma a chave, o saldo e o acesso
                    ao modelo <code className="font-mono">gpt-realtime-translate</code>{" "}
                    sem iniciar nenhuma sessão.
                  </li>
                </ol>
              </section>

              <section className="flex flex-col gap-2 border-t border-border pt-5">
                <h3 className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  Onde a chave fica
                </h3>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  No <code className="font-mono">localStorage</code> deste navegador, e
                  em mais lugar nenhum. Ela é enviada apenas para o servidor desta
                  própria aplicação, que a usa para criar um segredo temporário de
                  sessão e não guarda nada. O navegador nunca fala direto com a OpenAI
                  usando a chave permanente.
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Uma chave no <code className="font-mono">localStorage</code> é legível
                  por qualquer script que rode nesta página. Isso é adequado para uso
                  local ou numa instância só sua — não publique esta aplicação com sua
                  chave num ambiente compartilhado. Se preferir não guardá-la no
                  navegador, defina <code className="font-mono">OPENAI_API_KEY</code> no{" "}
                  <code className="font-mono">.env.local</code> do servidor: ela é usada
                  quando não há chave salva aqui.
                </p>
              </section>
            </TabsContent>

            <TabsContent value="glossary" className="m-0 p-6">
              <GlossaryEditor entries={glossary} onChange={onGlossaryChange} />
            </TabsContent>

            <TabsContent value="how" className="m-0 flex flex-col gap-5 p-6 text-[13px] leading-relaxed text-muted-foreground">
              <section className="flex flex-col gap-2">
                <h3 className="text-xs uppercase tracking-[0.1em]">O que acontece</h3>
                <p>
                  O microfone é capturado <strong className="font-medium text-foreground">uma vez</strong> e
                  enviado por WebRTC para a Realtime Translation API da OpenAI, que
                  roda o modelo{" "}
                  <code className="font-mono">gpt-realtime-translate</code>. Ele detecta
                  sozinho o idioma falado, entre mais de 70, e devolve três coisas ao
                  mesmo tempo: áudio traduzido, legenda da tradução e transcrição do
                  original.
                </p>
                <p>
                  A tradução começa enquanto a pessoa ainda fala. Não há turnos nem
                  espera pelo fim da frase.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-xs uppercase tracking-[0.1em]">Uma sessão por idioma</h3>
                <p>
                  O idioma de saída é fixado na criação da sessão, então cada destino
                  abre a sua própria conexão. Três idiomas são três sessões — mas um
                  único microfone, compartilhado entre elas.
                </p>
                <p>
                  É isso que define o custo: a OpenAI cobra por minuto de áudio, por
                  sessão. Dez minutos de reunião com dois idiomas equivalem a vinte
                  minutos-idioma. Pausar fecha as sessões e interrompe a cobrança.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-xs uppercase tracking-[0.1em]">Os 13 idiomas de saída</h3>
                <p>
                  Português, inglês, espanhol, italiano, francês, alemão, russo, chinês,
                  japonês, coreano, híndi, indonésio e vietnamita. A entrada aceita mais
                  de 70 idiomas, mas não são o mesmo conjunto.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-xs uppercase tracking-[0.1em]">Duas surpresas comuns</h3>
                <p>
                  <strong className="font-medium text-foreground">Falar no idioma de destino gera silêncio.</strong>{" "}
                  O modelo evita traduzir o que já está no idioma de saída. Com destino
                  em português e alguém falando português, aquele trecho simplesmente
                  não sai. A legenda avisa quando isso acontece.
                </p>
                <p>
                  <strong className="font-medium text-foreground">Não há glossário nem correção de nomes.</strong>{" "}
                  O modelo não aceita prompt, glossário ou guia de pronúncia. Termos de
                  domínio e nomes próprios podem sair trocados — vale testar os seus
                  antes de uma reunião que importa.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-xs uppercase tracking-[0.1em]">Privacidade</h3>
                <p>
                  Nenhum áudio é gravado e nada é enviado para banco de dados. O
                  histórico de transcrições fica no{" "}
                  <code className="font-mono">localStorage</code> deste navegador e pode
                  ser apagado a qualquer momento na tela de histórico.
                </p>
              </section>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
