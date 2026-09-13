"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TARGET_LANGUAGES } from "@/lib/languages";
import type { TargetLanguageCode } from "@/types/realtime";

interface LanguageSelectorProps {
  selected: readonly TargetLanguageCode[];
  onToggle: (language: TargetLanguageCode) => void;
  /** Idiomas que já têm sessão ativa, marcados como tal durante a tradução. */
  active?: readonly TargetLanguageCode[];
  disabled?: boolean;
}

/**
 * Só os 13 idiomas de SAÍDA suportados por `gpt-realtime-translate`.
 * A entrada aceita 70+ idiomas, mas não são o mesmo conjunto — ver
 * docs/openai-realtime-translation.md §6.
 */
export function LanguageSelector({
  selected,
  onToggle,
  active = [],
  disabled,
}: LanguageSelectorProps) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
        Traduzir para
      </span>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-2.5">
        {TARGET_LANGUAGES.map((language) => {
          const id = `lang-${language.code}`;
          return (
            <div key={language.code} className="flex items-center gap-2.5">
              <Checkbox
                id={id}
                data-lang={language.code}
                checked={selected.includes(language.code)}
                disabled={disabled}
                onCheckedChange={() => onToggle(language.code)}
              />
              <Label htmlFor={id} className="cursor-pointer text-[15px] font-normal">
                {language.label}
              </Label>
              {active.includes(language.code) ? (
                <Badge
                  variant="outline"
                  className="rounded-sm border-border px-1.5 py-0 text-[10px] font-normal uppercase tracking-[0.08em] text-muted-foreground"
                >
                  ativo
                </Badge>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
