import { cn } from "@/lib/utils";

/**
 * The app's one loading animation: a plain spinning ring with "Loading…" under it, centred on a
 * clean solid screen. No logo, no card, no panel.
 *
 *  - <LoadingScreen />          whole-screen (page opening, account loading)
 *  - <LoadingScreen overlay />  covers the page underneath (signing in)
 *  - <LoadingBlock />           lists, tables and cards that are still loading (also centred
 *                               on the screen, and fades in after 150 ms so quick loads never flash)
 */
export function LoadingScreen({
  title = "Loading…",
  overlay = false,
}: {
  title?: string;
  /** Kept so existing calls still compile; the loader shows just the title. */
  subtitle?: string;
  overlay?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        overlay
          ? "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background p-6"
          : "flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6"
      }
    >
      <Spinner className="h-12 w-12" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
    </div>
  );
}

/**
 * Just the spinning ring. `className` sets its size, e.g. "h-10 w-10".
 * `logo` is accepted for older code but no longer draws anything.
 */
export function Spinner({ className }: { className?: string; logo?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary",
        className,
      )}
    />
  );
}

/** Loading state for lists, tables, cards and pages that are still opening. */
export function LoadingBlock({
  title = "Loading…",
  className,
}: {
  title?: string;
  /** Kept so existing calls still compile; the loader shows just the title. */
  subtitle?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "loader-fade fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center",
        className,
      )}
    >
      <Spinner className="h-12 w-12" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
    </div>
  );
}