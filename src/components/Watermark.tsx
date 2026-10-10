import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";

/**
 * Plinthora "P" logo watermark.
 *
 * Always the Plinthora app logo (imported directly), never the signed-in
 * business's logo. Slightly transparent, click-through, and not selectable.
 */

/**
 * Bottom-right corner of the app, DESKTOP ONLY (hidden below the `lg` breakpoint
 * and when printing). Fixed to the viewport so it stays in the corner while the
 * page scrolls, and sits above page content without blocking any clicks.
 */
export function AppWatermark({ className }: { className?: string }) {
  return (
    <img
      src={logo}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        "pointer-events-none fixed bottom-4 right-4 z-30 hidden h-14 w-14 select-none opacity-25 lg:block print:hidden",
        className,
      )}
    />
  );
}

/**
 * Bottom-right corner of a receipt, ALL devices (phone, tablet, desktop) and in print.
 * Place it inside the receipt `<article>` and give that element `relative`.
 * The receipt is laid out at fixed A4 width and scaled to fit, so a fixed pixel
 * size here scales together with the page.
 */
export function ReceiptWatermark({ className }: { className?: string }) {
  return (
    <img
      src={logo}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        "receipt-watermark pointer-events-none absolute bottom-[8mm] right-[8mm] h-16 w-16 select-none opacity-25",
        className,
      )}
    />
  );
}