"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AudioSourceError,
  captureAudioSource,
  listAudioInputs,
  type AudioSourceKind,
} from "@/lib/audioSource";

export type MicrophoneStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "denied"
  | "unavailable";

/** Estado da permissão, quando o navegador expõe a Permissions API. */
export type MicrophonePermission = "unknown" | "prompt" | "granted" | "denied";

/**
 * Dono único da fonte de áudio.
 *
 * O microfone é capturado UMA vez; a mesma `MediaStreamTrack` é entregue a
 * todas as sessões de tradução (uma por idioma). `getTrack` é estável para
 * poder ser guardada por sessões criadas em momentos diferentes.
 */
export function useMicrophone() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [status, setStatus] = useState<MicrophoneStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<MicrophonePermission>("unknown");

  const streamRef = useRef<MediaStream | null>(null);

  const getStream = useCallback(() => streamRef.current, []);

  const getTrack = useCallback(
    () => streamRef.current?.getAudioTracks()[0] ?? null,
    [],
  );

  const refreshDevices = useCallback(async () => {
    try {
      const inputs = await listAudioInputs();
      setDevices(inputs);
      setDeviceId((current) => {
        if (current && inputs.some((d) => d.deviceId === current)) return current;
        return inputs[0]?.deviceId ?? "";
      });
    } catch {
      setDevices([]);
    }
  }, []);

  // A lista de dispositivos é estado externo: assinamos `devicechange` e
  // fazemos a primeira leitura fora do corpo síncrono do efeito.
  useEffect(() => {
    const handler = () => void refreshDevices();
    queueMicrotask(handler);
    if (!navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handler);
    };
  }, [refreshDevices]);

  // A permissão é estado externo do navegador: assinamos e refletimos.
  useEffect(() => {
    if (!navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    const onChange = () => setPermission((status?.state ?? "unknown") as MicrophonePermission);

    queueMicrotask(() => {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((result) => {
          status = result;
          onChange();
          result.addEventListener("change", onChange);
        })
        .catch(() => undefined);
    });

    return () => status?.removeEventListener("change", onChange);
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  /** Captura a fonte de áudio. Reusa o stream ativo se o dispositivo não mudou. */
  const start = useCallback(
    async (kind: AudioSourceKind = "microphone"): Promise<MediaStreamTrack> => {
      const existing = streamRef.current?.getAudioTracks()[0];
      if (existing && existing.readyState === "live") return existing;

      setStatus("requesting");
      setError(null);
      try {
        const next = await captureAudioSource({ kind, deviceId: deviceId || null });
        streamRef.current = next;
        setStream(next);
        setStatus("ready");
        setPermission("granted");
        // Os rótulos dos dispositivos só aparecem depois da permissão.
        void refreshDevices();
        return next.getAudioTracks()[0];
      } catch (caught) {
        const failure =
          caught instanceof AudioSourceError
            ? caught
            : new AudioSourceError("unavailable", String(caught));
        setStatus(failure.kind === "denied" ? "denied" : "unavailable");
        setError(failure.message);
        throw failure;
      }
    },
    [deviceId, refreshDevices],
  );

  /** Troca o dispositivo. Devolve a nova track para quem precisa repassá-la. */
  const changeDevice = useCallback(
    async (nextDeviceId: string): Promise<MediaStreamTrack | null> => {
      setDeviceId(nextDeviceId);
      if (!streamRef.current) return null;

      const previous = streamRef.current;
      try {
        const next = await captureAudioSource({
          kind: "microphone",
          deviceId: nextDeviceId,
        });
        streamRef.current = next;
        setStream(next);
        previous.getTracks().forEach((track) => track.stop());
        return next.getAudioTracks()[0];
      } catch (caught) {
        const failure =
          caught instanceof AudioSourceError
            ? caught
            : new AudioSourceError("unavailable", String(caught));
        setError(failure.message);
        return null;
      }
    },
    [],
  );

  const stop = useCallback(() => {
    releaseStream();
    setStatus("idle");
  }, [releaseStream]);

  useEffect(() => () => releaseStream(), [releaseStream]);

  return {
    devices,
    deviceId,
    permission,
    status,
    error,
    stream,
    getStream,
    getTrack,
    start,
    stop,
    changeDevice,
    refreshDevices,
  };
}
