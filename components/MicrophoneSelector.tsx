"use client";

import { AudioWaveform, type CaptureState } from "@/components/AudioWaveform";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MicrophoneSelectorProps {
  devices: MediaDeviceInfo[];
  deviceId: string;
  stream: MediaStream | null;
  disabled?: boolean;
  /** Mostra o botão de liberar o microfone quando ainda não há stream. */
  onPreview?: () => void;
  onCaptureState?: (state: CaptureState) => void;
  onChange: (deviceId: string) => void;
}

export function MicrophoneSelector({
  devices,
  deviceId,
  stream,
  disabled,
  onPreview,
  onCaptureState,
  onChange,
}: MicrophoneSelectorProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <Label
        htmlFor="microphone"
        className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground"
      >
        Microfone
      </Label>
      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={deviceId || undefined}
          disabled={disabled || devices.length === 0}
          onValueChange={onChange}
        >
          <SelectTrigger id="microphone" className="min-w-0 flex-1">
            <SelectValue placeholder="Nenhum dispositivo detectado" />
          </SelectTrigger>
          <SelectContent>
            {devices.map((device, index) => (
              <SelectItem key={device.deviceId} value={device.deviceId}>
                {device.label || `Entrada de áudio ${index + 1}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {stream || !onPreview ? (
          <AudioWaveform stream={stream} onStateChange={onCaptureState} />
        ) : (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onPreview}>
            Testar microfone
          </Button>
        )}
      </div>
    </div>
  );
}
