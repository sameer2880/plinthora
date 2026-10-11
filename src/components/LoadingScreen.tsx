import { Loader2 } from "lucide-react";
import pLogoDark from "@/assets/plinthora-p.png";
import pLogoLight from "@/assets/plinthora-p-light.png";
import { WaveLines } from "@/components/WaveLines";
import { cn } from "@/lib/utils";

/**
 * The app's one loading animation: a spinning ring with a title and "please wait" line.
 *
 *  - <LoadingScreen />          whole-screen (page opening, account loading)
 *  - <LoadingScreen overlay />  floats over the page underneath (signing in)
 *  - <LoadingBlock />           the same animation sized for a list, table or card area
 */
export function LoadingScreen({
  title = "Loading…",
  subtitle = "Please wait",
  overlay = false,
}: {
  title?: string;
  subtitle?: string;
  overlay?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        overlay
          ? "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background/85 p-6 backdrop-blur-sm"
          : "relative flex min-h-dvh flex-col items-center justify-center gap-4 overflow-hidden bg-background p-6"
      }
    >
      {!overlay && (
        <WaveLines className="pointer-events-none absolute inset-0 h-full w-full text-foreground opacity-20" />
      )}
      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <Spinner logo className="h-16 w-16" />
        <div>
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Just the spinning ring. `className` sets its size, e.g. "h-10 w-10".
 * `logo` shows the Plinthora "P" inside the ring (use it for the larger loaders only,
 * it is too small to read in a button). The P is dark green on the light theme and
 * the original white P on the dark theme, so it is visible in both.
 */
export function Spinner({ className, logo = false }: { className?: string; logo?: boolean }) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)}>
      <span className="absolute inset-0 rounded-full border-4 border-primary/15" />
      {logo && (
        <>
          <img
            src={pLogoLight}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute h-[52%] w-[52%] select-none object-contain dark:hidden"
          />
          <img
            src={pLogoDark}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute hidden h-[52%] w-[52%] select-none object-contain dark:block"
          />
        </>
      )}
      <Loader2 className="h-full w-full animate-spin stroke-[1.5] text-primary" />
    </span>
  );
}

/**
 * Loading state for lists, tables, cards and pages that are still opening.
 * The spinner always sits in the exact centre of the screen (not the corner of the card it
 * replaces), on a small frosted panel. The wrapper ignores taps, so the menu stays usable.
 */
export function LoadingBlock({
  title = "Loading…",
  subtitle = "Please wait",
  className,
}: {
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-6", className)}
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-background/90 px-8 py-6 text-center shadow-lg backdrop-blur-sm">
        <Spinner logo className="h-12 w-12" />
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}