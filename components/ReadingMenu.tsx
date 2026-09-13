"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CAPTION_FONTS, type CaptionFontId } from "@/lib/fonts";
import type { ReadingPreferences } from "@/lib/transcriptLog";

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 2.2;
export const SCALE_STEP = 0.1;

const ARRANGEMENTS: ReadonlyArray<{
  id: ReadingPreferences["arrangement"];
  label: string;
  note: string;
}> = [
  { id: "auto", label: "Automático", note: "Escolhe pela quantidade de idiomas." },
  { id: "columns", label: "Colunas", note: "Lado a lado, um idioma por coluna." },
  { id: "rows", label: "Linhas", note: "Empilhado, largura inteira." },
  { id: "grid", label: "Grade", note: "Blocos que quebram conforme a tela." },
];

const BANDS: ReadonlyArray<{ id: ReadingPreferences["captionBand"]; label: string }> = [
  { id: "small", label: "Baixa" },
  { id: "medium", label: "Média" },
  { id: "large", label: "Alta" },
];

interface ReadingMenuProps {
  preferences: ReadingPreferences;
  onChange: (patch: Partial<ReadingPreferences>) => void;
  /** No modo apresentação aparece o controle de altura da faixa. */
  showBandHeight?: boolean;
}

/** Controles de leitura: tamanho, fonte e organização das legendas. */
export function ReadingMenu({
  preferences,
  onChange,
  showBandHeight,
}: ReadingMenuProps) {
  const setScale = (next: number) =>
    onChange({ scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, Number(next.toFixed(2)))) });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs" data-menu="reading">
          Leitura
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Tamanho do texto
        </DropdownMenuLabel>
        <div className="flex items-center gap-2 px-2 pb-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-9 text-base leading-none"
            aria-label="Diminuir fonte"
            disabled={preferences.scale <= SCALE_MIN}
            onClick={(event) => {
              event.preventDefault();
              setScale(preferences.scale - SCALE_STEP);
            }}
          >
            −
          </Button>
          <span className="flex-1 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(preferences.scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-9 text-base leading-none"
            aria-label="Aumentar fonte"
            disabled={preferences.scale >= SCALE_MAX}
            onClick={(event) => {
              event.preventDefault();
              setScale(preferences.scale + SCALE_STEP);
            }}
          >
            +
          </Button>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Fonte
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preferences.fontId}
          onValueChange={(value) => onChange({ fontId: value as CaptionFontId })}
        >
          {CAPTION_FONTS.map((font) => (
            <DropdownMenuRadioItem
              key={font.id}
              value={font.id}
              data-font={font.id}
              onSelect={(event) => event.preventDefault()}
            >
              <span className="flex flex-col">
                <span style={{ fontFamily: font.stack }}>{font.label}</span>
                <span className="text-[11px] text-muted-foreground">{font.note}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Organização
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preferences.arrangement}
          onValueChange={(value) =>
            onChange({ arrangement: value as ReadingPreferences["arrangement"] })
          }
        >
          {ARRANGEMENTS.map((item) => (
            <DropdownMenuRadioItem
              key={item.id}
              value={item.id}
              data-arrangement={item.id}
              onSelect={(event) => event.preventDefault()}
            >
              <span className="flex flex-col">
                <span>{item.label}</span>
                <span className="text-[11px] text-muted-foreground">{item.note}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {showBandHeight ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Altura das legendas
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={preferences.captionBand}
              onValueChange={(value) =>
                onChange({ captionBand: value as ReadingPreferences["captionBand"] })
              }
            >
              {BANDS.map((band) => (
                <DropdownMenuRadioItem
                  key={band.id}
                  value={band.id}
                  data-band={band.id}
                  onSelect={(event) => event.preventDefault()}
                >
                  {band.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
