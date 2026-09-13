/**
 * Abstração da fonte de áudio.
 *
 * Hoje a interface só expõe `microphone`, mas a captura é isolada aqui para
 * que trocar por áudio de aba/janela (reuniões online) seja uma mudança de
 * parâmetro, não uma reescrita. O caminho `display` segue o padrão
 * "listen-along" do cookbook oficial da OpenAI.
 */

export type AudioSourceKind = "microphone" | "display";

export interface AudioSourceRequest {
  kind: AudioSourceKind;
  deviceId?: string | null;
}

export class AudioSourceError extends Error {
  constructor(
    readonly kind: "denied" | "unavailable" | "unsupported",
    message: string,
  ) {
    super(message);
    this.name = "AudioSourceError";
  }
}

export async function captureAudioSource({
  kind,
  deviceId,
}: AudioSourceRequest): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw new AudioSourceError(
      "unsupported",
      "Este navegador não expõe mediaDevices. Use HTTPS ou localhost.",
    );
  }

  try {
    return kind === "display"
      ? await captureDisplayAudio()
      : await captureMicrophone(deviceId);
  } catch (error) {
    throw toAudioSourceError(error);
  }
}

async function captureMicrophone(deviceId?: string | null): Promise<MediaStream> {
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (deviceId) audio.deviceId = { exact: deviceId };

  const stream = await navigator.mediaDevices.getUserMedia({ audio });
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((track) => track.stop());
    throw new AudioSourceError(
      "unavailable",
      "O dispositivo selecionado não entregou nenhuma trilha de áudio.",
    );
  }
  return stream;
}

async function captureDisplayAudio(): Promise<MediaStream> {
  if (!navigator.mediaDevices.getDisplayMedia) {
    throw new AudioSourceError(
      "unsupported",
      "Este navegador não suporta captura de áudio de aba.",
    );
  }

  const audio: MediaTrackConstraints & {
    suppressLocalAudioPlayback?: boolean;
  } = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };

  // Evita que o ouvinte escute o original e a tradução ao mesmo tempo.
  const supported = navigator.mediaDevices.getSupportedConstraints?.() as
    | (MediaTrackSupportedConstraints & { suppressLocalAudioPlayback?: boolean })
    | undefined;
  if (supported?.suppressLocalAudioPlayback) {
    audio.suppressLocalAudioPlayback = true;
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio,
  });

  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((track) => track.stop());
    throw new AudioSourceError(
      "unavailable",
      "Escolha uma aba e marque a opção de compartilhar o áudio.",
    );
  }
  return stream;
}

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "audioinput");
}

function toAudioSourceError(error: unknown): AudioSourceError {
  if (error instanceof AudioSourceError) return error;

  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new AudioSourceError(
      "denied",
      "Permissão de microfone negada. Autorize o acesso no navegador e tente de novo.",
    );
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new AudioSourceError(
      "unavailable",
      "Microfone indisponível. Conecte um dispositivo de entrada e recarregue.",
    );
  }
  if (name === "NotReadableError") {
    return new AudioSourceError(
      "unavailable",
      "O microfone está em uso por outro aplicativo.",
    );
  }
  return new AudioSourceError(
    "unavailable",
    error instanceof Error ? error.message : String(error),
  );
}
