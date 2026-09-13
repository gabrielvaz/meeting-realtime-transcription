"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TARGET_LANGUAGES } from "@/lib/languages";
import type { TargetLanguageCode } from "@/types/realtime";

interface LanguageMenuProps {
  selected: readonly TargetLanguageCode[];
  showOriginal: boolean;
  onToggleLanguage: (language: TargetLanguageCode) => void;
  onToggleOriginal: (value: boolean) => void;
}

/**
 * Dropdown da tela de tradução: liga e desliga idiomas sem parar a sessão, e
 * mostra ou esconde a transcrição original.
 */
export function LanguageMenu({
  selected,
  showOriginal,
  onToggleLanguage,
  onToggleOriginal,
}: LanguageMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs" data-menu="languages">
          Idiomas
          <span className="ml-1 tabular-nums text-muted-foreground">
            {selected.length}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Traduzir para
        </DropdownMenuLabel>
        {TARGET_LANGUAGES.map((language) => (
          <DropdownMenuCheckboxItem
            key={language.code}
            data-lang-menu={language.code}
            checked={selected.includes(language.code)}
            // Sem isso o menu fecha a cada clique e ligar três idiomas vira
            // três aberturas de menu.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggleLanguage(language.code)}
          >
            {language.label}
          </DropdownMenuCheckboxItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          data-original-toggle=""
          checked={showOriginal}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(value) => onToggleOriginal(value === true)}
        >
          Transcrição original
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
