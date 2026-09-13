"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Onda de captura desenhada em blocos pretos.
 *
 * Existe para responder a uma pergunta específica: "o microfone está pegando
 * minha voz?". E, quando não está, dizer **por quê** — as três causas comuns
 * têm sintomas idênticos em tela mas soluções completamente diferentes:
 *
 * - `track.muted === true`: a fonte não entrega amostras. No macOS isso é o
 *   sistema bloqueando o Chrome (Ajustes → Privacidade → Microfone), não a
 *   permissão da página, que pode estar concedida.
 * - `AudioContext` suspenso: o navegador não deixa medir áudio antes de um
 *   gesto do usuário. O medidor fica zerado com o microfone perfeito.
 * - Silêncio real: dispositivo errado selecionado, ou ninguém falando.
 *
 * Escreve direto no canvas; o estado de React só muda quando o diagnóstico
 * muda, não a cada quadro.
 */

const BLOCK = 3;
const GAP = 1;
const STEP = BLOCK + GAP;
/** Abaixo disso tratamos como silêncio. */
const SILENCE_LEVEL = 0.04;
/** Tempo sem nenhum pico antes de declarar "sem som". */
const SILENCE_MS = 2000;
/** Intervalo entre tentativas de retomar um contexto suspenso. */
const RESUME_RETRY_MS = 500;

export type CaptureState =
  | "stopped"
  | "blocked"
  | "suspended"
  | "ended"
  | "silent"
  | "hearing";

export const CAPTURE_LABEL: Record<CaptureState, string> = {
  stopped: "Microfone parado",
  blocked: "Bloqueado pelo sistema",
  suspended: "Toque na página",
  ended: "Microfone encerrado",
  silent: "Sem som",
  hearing: "Captando",
};

interface AudioWaveformProps {
  stream: MediaStream | null;
  width?: number;
  height?: number;
  showStatus?: boolean;
  onStateChange?: (state: CaptureState) => void;
}

export function AudioWaveform({
  stream,
  width = 168,
  height = 28,
  showStatus = true,
  onStateChange,
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<CaptureState>("stopped");
  const notifyRef = useRef(onStateChange);
  // Guardamos o callback numa ref para que trocar de handler não reinicie a
  // medição (o efeito abaixo depende só do stream).
  useEffect(() => {
    notifyRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const columns = Math.floor(width / STEP);
    const rows = Math.floor(height / STEP);
    const levels = new Array<number>(columns).fill(0);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#101010";
      for (let c = 0; c < columns; c += 1) {
        // Simétrico em torno do centro: lê como onda, não como barra.
        const lit = Math.max(1, Math.round(levels[c] * rows));
        const half = Math.ceil(lit / 2);
        const middle = Math.floor(rows / 2);
        for (let r = middle - half + 1; r <= middle + half - 1; r += 1) {
          if (r < 0 || r >= rows) continue;
          ctx.fillRect(c * STEP, r * STEP, BLOCK, BLOCK);
        }
      }
    };

    let lastState: CaptureState | null = null;
    const report = (next: CaptureState) => {
      if (next === lastState) return;
      lastState = next;
      setState(next);
      notifyRef.current?.(next);
    };

    if (!stream) {
      draw();
      report("stopped");
      return;
    }

    const track = stream.getAudioTracks()[0];
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!track || !AudioContextCtor) {
      draw();
      report("ended");
      return;
    }

    console.debug("[mic] track", {
      label: track.label,
      readyState: track.readyState,
      muted: track.muted,
      enabled: track.enabled,
      settings: track.getSettings(),
    });

    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    // O Chrome cria o AudioContext suspenso fora de um gesto do usuário, e um
    // contexto suspenso entrega silêncio absoluto. Tentamos retomar agora, no
    // primeiro gesto, e periodicamente enquanto continuar suspenso.
    const tryResume = () => {
      if (context.state === "suspended") void context.resume().catch(() => undefined);
    };
    tryResume();
    const gestures = ["pointerdown", "keydown", "touchstart"] as const;
    for (const event of gestures) {
      window.addEventListener(event, tryResume, { passive: true });
    }

    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    let lastLoudAt = 0;
    let lastResumeAt = 0;

    const tick = () => {
      const now = performance.now();

      if (context.state !== "running") {
        if (now - lastResumeAt > RESUME_RETRY_MS) {
          lastResumeAt = now;
          tryResume();
        }
        report("suspended");
        frame = requestAnimationFrame(tick);
        return;
      }

      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);
      // RMS cru quase não se move na fala normal; a raiz abre a escala.
      const level = Math.min(1, Math.sqrt(rms) * 2.4);

      levels.shift();
      levels.push(level);
      draw();

      if (level > SILENCE_LEVEL) lastLoudAt = now;

      if (track.readyState !== "live") report("ended");
      else if (track.muted) report("blocked");
      else if (lastLoudAt > 0 && now - lastLoudAt < SILENCE_MS) report("hearing");
      else report("silent");

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onMuteChange = () => {
      console.debug("[mic] track.muted =", track.muted);
    };
    track.addEventListener("mute", onMuteChange);
    track.addEventListener("unmute", onMuteChange);

    return () => {
      cancelAnimationFrame(frame);
      for (const event of gestures) window.removeEventListener(event, tryResume);
      track.removeEventListener("mute", onMuteChange);
      track.removeEventListener("unmute", onMuteChange);
      source.disconnect();
      analyser.disconnect();
      void context.close();
    };
  }, [stream, width, height]);

  return (
    <div className="flex items-center gap-3">
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        role="img"
        data-capture-state={state}
        aria-label={CAPTURE_LABEL[state]}
      />
      {showStatus ? (
        <span className="whitespace-nowrap text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {CAPTURE_LABEL[state]}
        </span>
      ) : null}
    </div>
  );
}
