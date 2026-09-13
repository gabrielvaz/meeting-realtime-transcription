"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CAPTION_FONTS, type CaptionFontId } from "@/lib/fonts";
import { THEMES } from "@/lib/themes";
import type { ReadingPreferences } from "@/lib/transcriptLog";
import { SCALE_MAX, SCALE_MIN, SCALE_STEP } from "@/components/ReadingMenu";

interface AppearanceSettingsProps {
  preferences: ReadingPreferences;
  onChange: (patch: Partial<ReadingPreferences>) => void;
}

/** Tema, fonte e tamanho do texto. Tudo salvo no `localStorage`. */
export function AppearanceSettings({ preferences, onChange }: AppearanceSettingsProps) {
  const setScale = (next: number) =>
    onChange({
      scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, Number(next.toFixed(2)))),
    });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <Label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
          Tema
        </Label>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              data-theme-option={theme.id}
              onClick={() => onChange({ theme: theme.id })}
              className={`flex items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-colors ${
                preferences.theme === theme.id
                  ? "border-foreground"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <span
                aria-hidden="true"
                className="flex size-7 flex-none items-center justify-center rounded-sm border border-border text-[13px] font-medium"
                style={{ background: theme.swatch[0], color: theme.swatch[1] }}
              >
                Aa
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm">{theme.label}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {theme.note}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-5">
        <Label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
          Fonte das legendas
        </Label>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
          {CAPTION_FONTS.map((font) => (
            <button
              key={font.id}
              type="button"
              data-font-option={font.id}
              onClick={() => onChange({ fontId: font.id as CaptionFontId })}
              className={`flex flex-col gap-0.5 rounded-sm border px-3 py-2.5 text-left transition-colors ${
                preferences.fontId === font.id
                  ? "border-foreground"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <span className="text-base" style={{ fontFamily: font.stack }}>
                {font.label}
              </span>
              <span className="text-[11px] text-muted-foreground">{font.note}</span>
            </button>
          ))}
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Só a Inter cobre cirílico e vietnamita. Nas outras, russo e vietnamita
          caem na fonte do sistema.
        </p>
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-5">
        <Label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
          Tamanho do texto
        </Label>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-11 text-lg leading-none"
            aria-label="Diminuir fonte"
            disabled={preferences.scale <= SCALE_MIN}
            onClick={() => setScale(preferences.scale - SCALE_STEP)}
          >
            −
          </Button>
          <span
            className="w-16 text-center text-sm tabular-nums"
            data-scale-value=""
          >
            {Math.round(preferences.scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-11 text-lg leading-none"
            aria-label="Aumentar fonte"
            disabled={preferences.scale >= SCALE_MAX}
            onClick={() => setScale(preferences.scale + SCALE_STEP)}
          >
            +
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={() => setScale(1)}
          >
            Padrão
          </Button>
        </div>
        <p
          className="rounded-sm border border-border px-4 py-3"
          style={{
            fontFamily: CAPTION_FONTS.find((f) => f.id === preferences.fontId)?.stack,
            fontSize: `calc(clamp(20px, 2.4vw, 34px) * ${preferences.scale})`,
            lineHeight: 1.24,
          }}
          data-appearance-preview=""
        >
          Acreditamos que este produto pode mudar a forma como os médicos
          analisam exames de Holter.
        </p>
      </section>
    </div>
  );
}
