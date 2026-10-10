import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AppLanding } from "@/components/AppLanding";

// Same breakpoint as the rest of the app (see src/hooks/use-device.tsx).
const MOBILE_BREAKPOINT = 768;

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const narrow = window.innerWidth < MOBILE_BREAKPOINT;
  const mobileUA = /android|iphone|ipod|mobile/i.test(navigator.userAgent);
  return narrow || mobileUA;
}

/**
 * Landing page on desktop / large tablets; on mobile it never shows.
 *
 * The redirect runs on the client (not in `beforeLoad`) because the first
 * server-rendered load has no `window`, so a route-level check can't see the
 * device and the landing page would still appear after hydration.
 *
 * - `max-md:hidden` hides the landing page on phones from the very first
 *   paint, so it never flashes before the redirect.
 * - `md:hidden` shows a small spinner on phones while we navigate.
 */
function IndexPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (isMobileDevice()) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [navigate]);

  return (
    <>
      <div className="md:hidden">
        <LoadingScreen title="Loading…" subtitle="Please wait a moment" />
      </div>
      <div className="max-md:hidden">
        <AppLanding />
      </div>
    </>
  );
}

export const Route = createFileRoute("/")({
  component: IndexPage,
});