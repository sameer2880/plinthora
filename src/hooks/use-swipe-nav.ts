import { useEffect, type RefObject } from "react";
import { useNavigate } from "@tanstack/react-router";

const MIN_DISTANCE = 80; // px the finger must travel sideways
const MAX_DURATION = 800; // ms - slow drags are scrolling/selecting, not swipes
const EDGE_GUARD = 24; // px - leave the phone's own back-swipe zone alone

/** True when the touch began somewhere a sideways swipe already means something else. */
function isSwipeBlocked(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node && node !== document.body) {
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (node.isContentEditable) return true;
    const role = node.getAttribute?.("role");
    if (role === "dialog" || role === "alertdialog" || role === "slider" || role === "menu") return true;
    if (node.hasAttribute?.("data-no-swipe")) return true;
    // A wide table / strip that scrolls sideways keeps its own swipe.
    const overflowX = getComputedStyle(node).overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth + 1) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Phone only: swipe right-to-left = next page, left-to-right = previous page,
 * following the order of `pages` (the same order as the navigation menu).
 * The first page ignores the "previous" swipe and the last page ignores the "next" swipe.
 */
export function useSwipeNav({
  enabled,
  pages,
  currentPath,
  targetRef,
}: {
  enabled: boolean;
  pages: string[];
  currentPath: string;
  targetRef: RefObject<HTMLElement | null>;
}) {
  const navigate = useNavigate();
  const index = pages.indexOf(currentPath);

  useEffect(() => {
    const el = targetRef.current;
    // Only on the main pages themselves - not on detail pages like /labour/123.
    if (!enabled || !el || index === -1) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      tracking = false;
      if (e.touches.length !== 1) return; // pinch / two fingers
      const t = e.touches[0];
      if (t.clientX < EDGE_GUARD || t.clientX > window.innerWidth - EDGE_GUARD) return;
      if (isSwipeBlocked(e.target)) return;
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
      tracking = true;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Date.now() - startTime > MAX_DURATION) return;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return;

      const target = dx < 0 ? index + 1 : index - 1; // right-to-left = next
      if (target < 0 || target >= pages.length) return; // first / last page: nothing to do
      navigate({ to: pages[target] });
    };

    const onCancel = () => {
      tracking = false;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled, index, pages, navigate, targetRef]);
}