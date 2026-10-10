import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** A4 width at 96 dpi (210 mm). The receipt is always laid out at this width. */
const A4_WIDTH_PX = 794;

/**
 * Shows its children as a real A4 page that always fits the screen.
 *
 * The page is laid out at full A4 width (so it looks exactly like the printed receipt on
 * every device) and then scaled down to the width available, keeping the A4 proportions.
 * On a phone the person sees the whole receipt at once, like a PDF page, and can pinch to
 * zoom in. On larger screens it stays at its natural size. Printing ignores the scaling.
 */
export function A4Sheet({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const available = outer.clientWidth;
      if (available > 0) setScale(Math.min(1, available / A4_WIDTH_PX));
      setHeight(inner.offsetHeight);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="a4-fit w-full">
      <style>{`
        @media print {
          .a4-fit-box { width: auto !important; height: auto !important; }
          .a4-fit-inner { width: 100% !important; transform: none !important; }
        }
      `}</style>
      <div
        className="a4-fit-box mx-auto"
        style={{
          width: A4_WIDTH_PX * scale,
          height: height === null ? undefined : height * scale,
        }}
      >
        <div
          ref={innerRef}
          className="a4-fit-inner"
          style={{
            width: A4_WIDTH_PX,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
      {scale < 0.85 && (
        <p className="mt-3 text-center text-xs text-muted-foreground print:hidden">
          Pinch to zoom in on the receipt
        </p>
      )}
    </div>
  );
}