import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppLanding } from "@/components/AppLanding";

// Same breakpoint as the rest of the app (see src/hooks/use-device.tsx):
// anything under 768px wide is treated as "mobile".
const MOBILE_BREAKPOINT = 768;

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false; // SSR: no window, render normally
  const byWidth = window.innerWidth < MOBILE_BREAKPOINT;
  const byUserAgent = /android|iphone|ipod|mobile/i.test(navigator.userAgent);
  return byWidth || byUserAgent;
}

export const Route = createFileRoute("/")({
  // On mobile, skip the app landing page entirely and go to the dashboard.
  // (Unauthenticated users are still sent to sign-in by the _authenticated route.)
  beforeLoad: () => {
    if (isMobileViewport()) {
      throw redirect({ to: "/dashboard", replace: true });
    }
  },
  // Desktop / large tablet keeps the landing page as before.
  component: AppLanding,
});