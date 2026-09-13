"use client";

import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getLanguage } from "@/lib/languages";
import {
  clearSessions,
  deleteSession,
  downloadText,
  formatDuration,
  loadSessions,
  sessionFilename,
  sessionToText,
  sessionsToText,
  type SessionLog,
} from "@/lib/transcriptLog";

/**
 * Histórico das transcrições guardadas no `localStorage` do próprio
 * navegador. Cada item mostra data, duração e idiomas, e pode ser copiado,
 * salvo em arquivo ou apagado — apagar sempre passa por confirmação.
 */
export function TranscriptHistory({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionLog[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  // Lemos o localStorage ao abrir o diálogo, não num efeito: o storage é
  // estado externo e a abertura é o evento que justifica reler.
  const handleOpenChange = useCallback((next: boolean) => {
    if (next) setSessions(loadSessions());
    setOpen(next);
  }, []);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const total = sessions.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85dvh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border p-6 pb-4">
          <DialogTitle className="text-sm font-semibold uppercase tracking-[0.12em]">
            Histórico de transcrições
          </DialogTitle>
          <DialogDescription>
            Guardado apenas neste navegador. Nada é enviado para servidor nenhum.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55dvh]">
          <div className="flex flex-col divide-y divide-border">
            {total === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Nenhuma transcrição guardada ainda.
              </p>
            ) : (
              sessions.map((session) => {
                const text = sessionToText(session);
                const segments =
                  session.source.length +
                  Object.values(session.translations).reduce(
                    (sum, list) => sum + (list?.length ?? 0),
                    0,
                  );
                return (
                  <article key={session.id} data-session={session.id} className="flex flex-col gap-2 p-5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-sm">
                        {new Date(session.startedAt).toLocaleString("pt-BR")}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatDuration(session.durationMs)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {session.languages.map((code) => getLanguage(code).label).join(" · ") ||
                          "sem idioma"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {segments} trecho{segments === 1 ? "" : "s"}
                      </span>
                    </div>

                    <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                      {session.source[0] ??
                        Object.values(session.translations)[0]?.[0] ??
                        "—"}
                    </p>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => void copy(session.id, text)}
                      >
                        {copied === session.id ? "Copiado" : "Copiar"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => downloadText(sessionFilename(session), text)}
                      >
                        Salvar em arquivo
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            Apagar
                          </Button>
                        }
                        title="Apagar esta transcrição?"
                        description={`A transcrição de ${new Date(
                          session.startedAt,
                        ).toLocaleString("pt-BR")} será removida deste navegador. Não dá para desfazer.`}
                        confirmLabel="Apagar"
                        onConfirm={() => setSessions(deleteSession(session.id))}
                      />
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </ScrollArea>

        {total > 0 ? (
          <DialogFooter className="flex-row flex-wrap gap-2 border-t border-border p-5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => void copy("all", sessionsToText(sessions))}
            >
              {copied === "all" ? "Copiado" : "Copiar tudo"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() =>
                downloadText("traducoes-ao-vivo.txt", sessionsToText(sessions))
              }
            >
              Salvar tudo em arquivo
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  Apagar tudo
                </Button>
              }
              title="Apagar todo o histórico?"
              description={`As ${total} transcrições guardadas neste navegador serão removidas. Não dá para desfazer.`}
              confirmLabel="Apagar tudo"
              onConfirm={() => setSessions(clearSessions())}
            />
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
