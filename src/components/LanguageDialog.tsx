import { type ReactNode, useState } from "react";
import { Check, Languages } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LANGUAGES, translate, useI18n, type Lang } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * App language picker. `renderTrigger` receives an `open()` function so the caller
 * decides how the opener looks (the More menu uses a full-width button).
 */
export function LanguageDialog({ renderTrigger }: { renderTrigger: (open: () => void) => ReactNode }) {
  const { lang, t, setLang } = useI18n();
  const [open, setOpen] = useState(false);

  const choose = (code: Lang) => {
    setLang(code);
    toast.success(translate("Language changed", code));
    setOpen(false);
  };

  return (
    <>
      {renderTrigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Languages className="h-5 w-5" /> {t("App language")}
            </DialogTitle>
            <DialogDescription>{t("Choose the language you want to use in the app.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {LANGUAGES.map((l) => {
              const active = l.code === lang;
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => choose(l.code)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                    active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
                  )}
                >
                  <span>
                    <span className="block text-base font-semibold">{l.label}</span>
                    {l.label !== l.english && <span className="block text-xs text-muted-foreground">{l.english}</span>}
                  </span>
                  {active && <Check className="h-5 w-5 text-primary" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}