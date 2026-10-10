import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, ServerCrash, WifiOff } from "lucide-react";
import { useConnectionState } from "@/lib/connection";
import { cn } from "@/lib/utils";

/**
 * Tells the person when the internet is down or the server can't be reached, and
 * retries on its own. Mounted once at the root, so it shows on every screen
 * (sign-in page included).
 */
export function ConnectionBanner() {
  const status = useConnectionState();
  const queryClient = useQueryClient();

  const retry = () => {
    void queryClient.invalidateQueries();
    window.dispatchEvent(new Event("mbs-retry"));
  };

  // While there's a problem, quietly try again every few seconds.
  useEffect(() => {
    if (status !== "offline" && status !== "server") return;
    const id = window.setInterval(() => {
      if (navigator.onLine !== false) retry();
    }, 8000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === "online") return null;

  const config = {
    offline: {
      Icon: WifiOff,
      text: "No internet connection. Check your network — we'll reconnect automatically.",
      tone: "bg-red-600 text-white",
    },
    server: {
      Icon: ServerCrash,
      text: "Can't reach the server. Please check your connection — retrying…",
      tone: "bg-amber-500 text-black",
    },
    restored: {
      Icon: CheckCircle2,
      text: "Back online",
      tone: "bg-emerald-600 text-white",
    },
  }[status];

  return (
    <div
      role="status"
      aria-live="assertive"
      className={cn(
        "fixed inset-x-0 top-0 z-[120] flex items-center justify-center gap-2 px-3 pb-2 text-xs font-medium shadow-md sm:text-sm",
        "pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]",
        config.tone,
      )}
    >
      <config.Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0">{config.text}</span>
      {status !== "restored" && (
        <button
          type="button"
          onClick={retry}
          className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-black/20 px-2.5 py-1 text-xs font-semibold hover:bg-black/30"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
    </div>
  );
}