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
import type { ReadingPreferences } from "@/lib/transcriptLog";

type Layout = ReadingPreferences["captionLayout"];

const LAYOUTS: ReadonlyArray<{ id: Layout; label: string; note: string }> = [
  { id: "bottom", label: "Abaixo dos slides", note: "Faixa na parte inferior." },
  { id: "top", label: "Acima dos slides", note: "Faixa na parte superior." },
  { id: "right", label: "Na lateral direita", note: "Coluna ao lado dos slides." },
  { id: "overlay", label: "Sobre os slides", note: "Sobreposta, com fundo translúcido." },
  { id: "hidden", label: "Ocultar", note: "Só os slides. A tradução continua rodando." },
];

/**
 * Atalhos de tamanho. O ajuste fino é arrastando a divisa entre os slides e as
 * legendas; estes três só levam a faixa para um ponto conhecido em um clique.
 */
const PRESETS: ReadonlyArray<{ id: string; label: string; percent: number }> = [
  { id: "small", label: "Pequena", percent: 18 },
  { id: "medium", label: "Média", percent: 30 },
  { id: "large", label: "Grande", percent: 45 },
];

const ARRANGEMENTS: ReadonlyArray<{
  id: ReadingPreferences["arrangement"];
  label: string;
}> = [
  { id: "auto", label: "Automático" },
  { id: "columns", label: "Colunas" },
  { id: "rows", label: "Linhas" },
  { id: "grid", label: "Grade" },
];

interface LayoutMenuProps {
  preferences: ReadingPreferences;
  onChange: (patch: Partial<ReadingPreferences>) => void;
}

type SizedLayout = Exclude<ReadingPreferences["captionLayout"], "hidden">;

/**
 * Onde as legendas ficam durante a apresentação.
 *
 * Fica na barra, e não no modal de configuração, porque é o controle que se
 * mexe no meio da fala: o slide muda, o texto atrapalha, você tira da frente.
 */
export function LayoutMenu({ preferences, onChange }: LayoutMenuProps) {
  const hidden = preferences.captionLayout === "hidden";
  const sized = preferences.captionLayout as SizedLayout;
  const current = hidden ? 0 : preferences.bandSize[sized];

  const setSize = (percent: number) =>
    onChange({ bandSize: { ...preferences.bandSize, [sized]: percent } });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs" data-menu="layout">
          Layout
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Posição das legendas
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preferences.captionLayout}
          onValueChange={(value) => onChange({ captionLayout: value as Layout })}
        >
          {LAYOUTS.map((item) => (
            <DropdownMenuRadioItem
              key={item.id}
              value={item.id}
              data-layout-option={item.id}
              onSelect={(event) => event.preventDefault()}
            >
              <span className="flex flex-col">
                <span>{item.label}</span>
                <span className="text-[11px] text-muted-foreground">{item.note}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {hidden ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              <span>{preferences.captionLayout === "right" ? "Largura" : "Altura"}</span>
              <span className="tabular-nums" data-band-size="">
                {Math.round(current)}%
              </span>
            </DropdownMenuLabel>
            <div className="flex gap-1.5 px-2 pb-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  variant="outline"
                  size="sm"
                  data-band={preset.id}
                  className={`h-7 flex-1 text-xs ${
                    Math.round(current) === preset.percent ? "border-foreground" : ""
                  }`}
                  onClick={(event) => {
                    event.preventDefault();
                    setSize(preset.percent);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <p className="px-2 pb-2 text-[11px] leading-relaxed text-muted-foreground">
              Ou arraste a divisa entre os slides e as legendas. Duplo clique nela
              volta ao padrão.
            </p>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Vários idiomas
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
                  {item.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
