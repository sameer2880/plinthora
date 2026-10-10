import wordmark from "@/assets/plinthora-wordmark.png";
import { PLATFORM_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * The "Plinthora" wordmark image — used in place of the text title on the sign-in
 * screens. Size it with a height class (width follows automatically), e.g. `h-6`.
 *
 * The wordmark is dark green, which would disappear on the dark theme, so there it
 * is switched to white.
 */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <img
      src={wordmark}
      alt={PLATFORM_NAME}
      draggable={false}
      className={cn("h-6 w-auto select-none dark:brightness-0 dark:invert", className)}
    />
  );
}