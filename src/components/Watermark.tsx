import wordmark from "@/assets/plinthora-wordmark.png";
import { cn } from "@/lib/utils";

/**
 * Plinthora wordmark watermark for receipts.
 *
 * Always the Plinthora app wordmark (imported directly), never the signed-in
 * business's logo. Shown at full strength, click-through and not selectable.
 *
 * Shown on ALL devices (phone, tablet, desktop) and in print. Place it inside the
 * receipt `<article>` and give that element `relative`. The receipt is laid out at
 * fixed A4 width and scaled to fit, so the fixed size here scales with the page.
 */
export function ReceiptWatermark({ className }: { className?: string }) {
  return (
    <img
      src={wordmark}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        "receipt-watermark pointer-events-none absolute bottom-[8mm] right-[8mm] h-auto w-40 select-none object-contain",
        className,
      )}
    />
  );
}