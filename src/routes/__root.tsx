import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/brand";
import { syncNativeStatusBar } from "@/lib/native-status-bar";
import { listenForAppUrls } from "@/lib/native-oauth";
import { ConnectionBanner } from "@/components/ConnectionBanner";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { name: "theme-color", content: "#f3f6ee" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { title: PLATFORM_NAME },
      { name: "description", content: PLATFORM_TAGLINE },
      { name: "google-site-verification", content: "google2ae77d07cfbf23ca.html" },
      { property: "og:title", content: PLATFORM_NAME },
      { property: "og:description", content: PLATFORM_TAGLINE },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/logo.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

// Runs synchronously in <head>, before anything paints, so the status bar
// color is correct on the very first frame instead of flashing/mismatching.
// Keep the hex values below in sync with `--background` in styles.css.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("mbs-theme");
    var isDark = stored === "dark";
    if (isDark) {
      document.documentElement.classList.add("dark");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", isDark ? "#0e1911" : "#f3f6ee");
    }
  } catch (e) {}
})();
`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Live updates, app-wide: whenever a row changes in the database (from this tab, another
  // tab, another device, or another user) the matching cached queries are invalidated so
  // React Query refetches them and every open screen updates on its own - no manual refresh.
  //
  // Three layers, so data stays fresh even when one of them fails:
  //  1. Realtime: one channel per table, instant. Each channel reconnects by itself (with
  //     back-off) if the connection drops, and re-syncs the screen when it comes back.
  //     Needs the tables in Supabase's `supabase_realtime` publication - run
  //     `20260902000000_enable_realtime_tables.sql` once in the Supabase SQL Editor.
  //  2. Catch-up: when the app/tab comes back to the front, the phone regains internet, or the
  //     window is focused, everything on screen is refetched.
  //  3. Safety poll: while the app is visible, the screen is refetched every minute, so
  //     even if realtime is not enabled in the database yet, changes still appear on their own.
  useEffect(() => {
    let disposed = false;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Map<string, string[]>();

    // Several rows often change together (e.g. a multi-item rental): batch into one refetch.
    const flush = () => {
      flushTimer = undefined;
      for (const key of pending.values()) void queryClient.invalidateQueries({ queryKey: key });
      pending.clear();
    };
    const queue = (keys: string[][]) => {
      for (const key of keys) pending.set(JSON.stringify(key), key);
      if (flushTimer === undefined) flushTimer = setTimeout(flush, 250);
    };

    // Refetch everything currently on screen (other cached screens are only marked stale).
    let lastRefreshAt = 0;
    const refreshAll = () => {
      if (disposed) return;
      const now = Date.now();
      if (now - lastRefreshAt < 10_000) return;
      lastRefreshAt = now;
      void queryClient.invalidateQueries();
    };

    // table -> query keys that show its data. A key matches every query that starts with it,
    // e.g. ["worker"] also covers ["worker", id].
    const LIVE_TABLES: Record<string, string[][]> = {
      rentals: [["rentals"], ["rental"], ["rental-group"], ["public-receipt"]],
      workers: [["workers"], ["worker"], ["dashboard_workers"], ["platform"]],
      worker_attendance: [["worker_attendance"], ["all_attendance"], ["dashboard_attendance"]],
      worker_payments: [["worker_payments"]],
      worker_feedback: [["worker_feedback"], ["worker_feedback_admin"]],
      worker_locations: [["worker-locations-admin"]],
      diary_notes: [["diary_notes"]],
      businesses: [["platform"]],
      profiles: [["platform"], ["workers"], ["dashboard_workers"]],
      user_roles: [["platform"], ["workers"], ["dashboard_workers"]],
      platform_admins: [["platform"]],
    };

    const stops: Array<() => void> = [];

    const watchTable = (table: string, keys: string[][]) => {
      let channel: RealtimeChannel | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let attempts = 0;
      let wasConnected = false;
      let stopped = false;

      const connect = () => {
        if (stopped) return;
        const ch = supabase.channel(`live-${table}-${Math.random().toString(36).slice(2, 8)}`);
        channel = ch;

        ch.on("postgres_changes", { event: "*", schema: "public", table }, () => queue(keys));

        ch.subscribe((status) => {
          if (stopped || channel !== ch) return;

          if (status === "SUBSCRIBED") {
            attempts = 0;
            // Reconnected after a drop: pick up anything that changed while we were offline.
            if (wasConnected) queue(keys);
            wasConnected = true;
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            channel = null;
            void supabase.removeChannel(ch);
            attempts += 1;
            const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5));
            retryTimer = setTimeout(connect, delay);
          }
        });
      };

      connect();

      stops.push(() => {
        stopped = true;
        if (retryTimer !== undefined) clearTimeout(retryTimer);
        if (channel) void supabase.removeChannel(channel);
        channel = null;
      });
    };

    for (const [table, keys] of Object.entries(LIVE_TABLES)) watchTable(table, keys);

    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshAll);
    window.addEventListener("online", refreshAll);

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refreshAll();
    }, 60_000);

    return () => {
      disposed = true;
      if (flushTimer !== undefined) clearTimeout(flushTimer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshAll);
      window.removeEventListener("online", refreshAll);
      for (const stop of stops) stop();
    };
  }, [queryClient]);

  // In the native LedGro app, keep the status-bar strip the same colour as the header.
  // Watches the <html class="dark"> flag, so it follows the theme toggle automatically.
  // Does nothing in a normal browser.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => syncNativeStatusBar(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // In the native app, receive the address Android hands over when Google sign-in finishes
  // (com.plinthora.app://auth/google#...) or when a WhatsApp link is tapped. Does nothing in a browser.
  useEffect(() => {
    listenForAppUrls();
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch((error) => {
          console.warn("Offline app support is unavailable", error);
        });
    }
  }, []);
  useEffect(() => {
    const recoveryKey = "mbs-dynamic-import-recovery";
    const isDynamicImportFailure = (message: string) =>
      message.includes("Failed to fetch dynamically imported module") ||
      message.includes("Importing a module script failed");
    const reloadOnce = (message: string) => {
      if (!isDynamicImportFailure(message)) return;
      try {
        if (sessionStorage.getItem(recoveryKey) === "1") {
          sessionStorage.removeItem(recoveryKey);
          return;
        }
        sessionStorage.setItem(recoveryKey, "1");
      } catch {
        return;
      }
      void (async () => {
        try {
          const registrations = await navigator.serviceWorker?.getRegistrations();
          await Promise.all(registrations?.map((registration) => registration.unregister()) ?? []);
          const cacheNames = await caches?.keys();
          await Promise.all(cacheNames?.map((name) => caches.delete(name)) ?? []);
        } catch {
          // Continue with a cache-busting navigation if storage APIs are unavailable.
        }
        const url = new URL(window.location.href);
        url.searchParams.set("asset_refresh", String(Date.now()));
        window.location.replace(url.toString());
      })();
    };
    const onError = (event: ErrorEvent) => reloadOnce(event.message || event.error?.message || "");
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reloadOnce(typeof reason === "string" ? reason : (reason?.message ?? ""));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionBanner />
      <Outlet />
      <Toaster
        richColors
        position="top-right"
        mobileOffset={{
          top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
          left: "0.75rem",
          right: "0.75rem",
        }}
      />
      <ConfirmDialogHost />
    </QueryClientProvider>
  );
}