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

const SIZES: ReadonlyArray<{ id: ReadingPreferences["captionBand"]; label: string }> = [
  { id: "small", label: "Pequena" },
  { id: "medium", label: "Média" },
  { id: "large", label: "Grande" },
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

/**
 * Onde as legendas ficam durante a apresentação.
 *
 * Fica na barra, e não no modal de configuração, porque é o controle que se
 * mexe no meio da fala: o slide muda, o texto atrapalha, você tira da frente.
 */
export function LayoutMenu({ preferences, onChange }: LayoutMenuProps) {
  const hidden = preferences.captionLayout === "hidden";

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
            <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {preferences.captionLayout === "right" ? "Largura" : "Altura"}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={preferences.captionBand}
              onValueChange={(value) =>
                onChange({ captionBand: value as ReadingPreferences["captionBand"] })
              }
            >
              {SIZES.map((size) => (
                <DropdownMenuRadioItem
                  key={size.id}
                  value={size.id}
                  data-band={size.id}
                  onSelect={(event) => event.preventDefault()}
                >
                  {size.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

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
