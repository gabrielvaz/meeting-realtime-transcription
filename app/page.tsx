"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CAPTURE_LABEL, type CaptureState } from "@/components/AudioWaveform";
import { LanguageSelector } from "@/components/LanguageSelector";
import { MicrophoneSelector } from "@/components/MicrophoneSelector";
import { SessionControls } from "@/components/SessionControls";
import { SettingsDialog } from "@/components/SettingsDialog";
import { TranscriptHistory } from "@/components/TranscriptHistory";
import { TranslationDisplay } from "@/components/TranslationDisplay";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { readApiKey } from "@/lib/apiKey";
import {
  DEFAULT_GLOSSARY,
  loadGlossary,
  saveGlossary,
  type GlossaryEntry,
} from "@/lib/glossary";
import { TARGET_LANGUAGES } from "@/lib/languages";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type ReadingPreferences,
} from "@/lib/transcriptLog";
import { useMicrophone } from "@/hooks/useMicrophone";
import { useRealtimeTranslation } from "@/hooks/useRealtimeTranslation";
import type { TargetLanguageCode } from "@/types/realtime";

const MIC_STATUS_MESSAGE: Record<string, string> = {
  requesting: "Solicitando permissão do microfone…",
  denied: "Permissão de microfone negada.",
  unavailable: "Microfone indisponível.",
};

/** Explicação por trás de cada diagnóstico ruim da captura. */
const CAPTURE_HINT: Partial<Record<CaptureState, string>> = {
  blocked:
    "O sistema operacional está bloqueando o microfone para o navegador. No macOS: Ajustes do Sistema → Privacidade e Segurança → Microfone, e ligue o Chrome. Depois recarregue a página.",
  suspended:
    "O navegador só libera a medição de áudio depois de um clique na página. Clique em qualquer lugar.",
  silent:
    "O microfone está aberto mas não chega sinal. Confira se o dispositivo selecionado acima é o certo e se ele não está mudo no sistema.",
  ended: "A captura foi encerrada. Recarregue a página para tentar de novo.",
};

export default function Page() {
  const [selected, setSelected] = useState<TargetLanguageCode[]>(["pt"]);
  const [preferences, setPreferences] = useState<ReadingPreferences>(DEFAULT_PREFERENCES);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [capture, setCapture] = useState<CaptureState>("stopped");
  const [hasLocalKey, setHasLocalKey] = useState(false);
  const [hasServerKey, setHasServerKey] = useState<boolean | null>(null);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>(DEFAULT_GLOSSARY);

  const microphone = useMicrophone();
  const translation = useRealtimeTranslation({
    getStream: microphone.getStream,
    glossary,
  });

  const isLive = translation.runState !== "idle";
  const paused = translation.runState === "paused";

  // Preferências de leitura ficam no localStorage: quem projeta numa TV não
  // quer reconfigurar fonte e tamanho toda reunião.
  useEffect(() => {
    queueMicrotask(() => {
      setPreferences(loadPreferences());
      setGlossary(loadGlossary());
    });
  }, []);

  const updateGlossary = useCallback((entries: GlossaryEntry[]) => {
    setGlossary(entries);
    saveGlossary(entries);
  }, []);

  // Precisamos saber se existe alguma chave antes de deixar iniciar: a do
  // usuário (localStorage) ou a do servidor (.env.local). Na build estática
  // não há servidor, então nem perguntamos.
  useEffect(() => {
    queueMicrotask(() => {
      setHasLocalKey(Boolean(readApiKey()));
      if (process.env.NEXT_PUBLIC_STATIC_EXPORT === "1") {
        setHasServerKey(false);
        return;
      }
      void fetch("/api/realtime/token")
        .then((response) => response.json())
        .then((body: { serverKey?: boolean }) => setHasServerKey(Boolean(body.serverKey)))
        .catch(() => setHasServerKey(false));
    });
  }, []);

  const updatePreferences = useCallback((patch: Partial<ReadingPreferences>) => {
    setPreferences((previous) => {
      const next = { ...previous, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  /**
   * Se o navegador já tem permissão, liga o microfone antes de iniciar a
   * tradução. Sem isso a onda fica parada na tela inicial e não dá para saber
   * se o microfone funciona sem entrar numa sessão paga.
   */
  const previewRequested = useRef(false);
  const startPreview = useCallback(() => {
    previewRequested.current = true;
    void microphone.start("microphone").catch(() => undefined);
  }, [microphone]);

  useEffect(() => {
    if (isLive || previewRequested.current) return;
    if (microphone.permission !== "granted" || microphone.stream) return;
    queueMicrotask(startPreview);
  }, [isLive, microphone.permission, microphone.stream, startPreview]);

  // Mantém a ordem da lista de idiomas, não a ordem de clique.
  const orderedTracks = useMemo(() => {
    const order = TARGET_LANGUAGES.map((language) => language.code);
    return Object.values(translation.tracks)
      .filter((track) => track.visible)
      .sort((a, b) => order.indexOf(a.language) - order.indexOf(b.language));
  }, [translation.tracks]);

  const reconnecting = orderedTracks.some(
    (track) => track.status === "reconnecting" || track.status === "requesting-token",
  );

  const handleStop = useCallback(() => {
    translation.stop();
    microphone.stop();
    previewRequested.current = false;
  }, [microphone, translation]);

  const handleToggleLanguage = useCallback(
    (language: TargetLanguageCode) => {
      const wasSelected = selected.includes(language);
      const next = wasSelected
        ? selected.filter((code) => code !== language)
        : [...selected, language];
      setSelected(next);

      if (!isLive || paused) return;

      // Durante a sessão, adicionar ou remover mexe só na sessão daquele
      // idioma — as outras continuam traduzindo sem interrupção.
      if (wasSelected) {
        translation.removeLanguage(language);
        if (next.length === 0) handleStop();
      } else {
        translation.addLanguage(language);
      }
    },
    [handleStop, isLive, paused, selected, translation],
  );

  const handleStart = useCallback(async () => {
    if (!selected.length) {
      setSetupError("Selecione pelo menos um idioma de destino.");
      return;
    }
    setSetupError(null);
    setStarting(true);
    try {
      await microphone.start("microphone");
      translation.start(selected);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }, [microphone, selected, translation]);

  const handleTogglePause = useCallback(() => {
    if (paused) translation.resume(selected);
    else translation.pause();
  }, [paused, selected, translation]);

  const handleDeviceChange = useCallback(
    async (deviceId: string) => {
      const track = await microphone.changeDevice(deviceId);
      if (track && isLive) await translation.replaceTrack(track);
    },
    [isLive, microphone, translation],
  );

  if (isLive) {
    return (
      <div className="app flex h-dvh flex-col overflow-hidden">
        <SessionControls
          elapsedSeconds={translation.usage.elapsedSeconds}
          selected={selected}
          reconnecting={reconnecting}
          paused={paused}
          showOriginal={preferences.showOriginal}
          preferences={preferences}
          glossary={glossary}
          stream={microphone.stream}
          onGlossaryChange={updateGlossary}
          onToggleLanguage={handleToggleLanguage}
          onToggleOriginal={(value) => updatePreferences({ showOriginal: value })}
          onPreferences={updatePreferences}
          onTogglePause={handleTogglePause}
          onClear={translation.clearTranscripts}
          onStop={handleStop}
        />

        <TranslationDisplay
          tracks={orderedTracks}
          sourceSubtitle={translation.sourceSubtitle}
          sourceActive={translation.sourceActive}
          paused={paused}
          preferences={preferences}
        />
      </div>
    );
  }

  const captureHint = microphone.stream ? CAPTURE_HINT[capture] : undefined;
  // `null` enquanto a checagem do servidor não voltou: não bloqueamos por
  // suspeita, só por certeza.
  const missingKey = !hasLocalKey && hasServerKey === false;

  return (
    <div className="app flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-[680px] flex-col gap-9 overflow-y-auto px-6 pb-16 pt-[clamp(32px,7vh,96px)]">
        <div className="flex items-center justify-between gap-4">
          <h1 className="title text-[13px] font-semibold uppercase tracking-[0.14em]">
            Tradução ao vivo
          </h1>
          <div className="flex items-center gap-2">
            <SettingsDialog
              glossary={glossary}
              onGlossaryChange={updateGlossary}
              onKeyChange={setHasLocalKey}
              trigger={
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  Configurar
                </Button>
              }
            />
            <TranscriptHistory
              trigger={
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  Histórico
                </Button>
              }
            />
          </div>
        </div>

        <MicrophoneSelector
          devices={microphone.devices}
          deviceId={microphone.deviceId}
          stream={microphone.stream}
          onPreview={startPreview}
          onCaptureState={setCapture}
          onChange={handleDeviceChange}
        />

        {captureHint ? (
          <Alert role="status">
            <AlertDescription>
              <strong className="font-medium">{CAPTURE_LABEL[capture]}.</strong>{" "}
              {captureHint}
            </AlertDescription>
          </Alert>
        ) : null}

        <Separator />

        <LanguageSelector selected={selected} onToggle={handleToggleLanguage} />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Cada idioma de destino abre uma sessão própria na OpenAI. O microfone é
          capturado uma única vez e compartilhado entre elas. O modelo não traduz
          fala que já esteja no idioma de saída — para ouvir tradução falando
          português, escolha outro destino.
        </p>

        <div className="flex items-center gap-2.5">
          <Checkbox
            id="setup-show-original"
            checked={preferences.showOriginal}
            onCheckedChange={(value) =>
              updatePreferences({ showOriginal: value === true })
            }
          />
          <Label
            htmlFor="setup-show-original"
            className="cursor-pointer text-sm font-normal text-muted-foreground"
          >
            Mostrar transcrição original
          </Label>
        </div>

        {missingKey ? (
          <Alert role="status">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>
                Nenhuma chave da OpenAI configurada. Sem ela não há como traduzir.
              </span>
              <SettingsDialog
                glossary={glossary}
                onGlossaryChange={updateGlossary}
                onKeyChange={setHasLocalKey}
                trigger={
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    Configurar agora
                  </Button>
                }
              />
            </AlertDescription>
          </Alert>
        ) : null}

        <Button
          className="self-start"
          size="lg"
          onClick={handleStart}
          // `starting` já impede clique duplo. Não amarramos o botão ao estado
          // da prévia: uma prévia pendurada não pode impedir de traduzir.
          disabled={starting || missingKey}
        >
          {starting ? "Conectando…" : "Iniciar tradução"}
        </Button>

        {setupError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{setupError}</AlertDescription>
          </Alert>
        ) : microphone.status in MIC_STATUS_MESSAGE ? (
          <Alert role="status">
            <AlertDescription>
              {MIC_STATUS_MESSAGE[microphone.status]}
            </AlertDescription>
          </Alert>
        ) : null}
      </main>
    </div>
  );
}
