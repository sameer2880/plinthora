import { useSyncExternalStore } from "react";

/**
 * App-wide connection status, shown by <ConnectionBanner />.
 *
 *  online   - everything is fine (nothing is shown)
 *  offline  - the device has no internet
 *  server   - the device is online but our server could not be reached
 *  restored - the connection just came back ("Back online" for a few seconds)
 */
export type ConnectionState = "online" | "offline" | "server" | "restored";

let state: ConnectionState = "online";
let restoredTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: ConnectionState) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

const NETWORK_PATTERN =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|network error|err_internet|err_network|err_connection|timed? ?out|timeout|econnreset|enotfound|socket hang up/i;

/** True when an error (or error message) means "could not reach the server" rather than a real answer. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err == null) return false;
  const message =
    typeof err === "string"
      ? err
      : typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message ?? "")
        : "";
  const name = typeof err === "object" && "name" in err ? String((err as { name?: unknown }).name ?? "") : "";
  return NETWORK_PATTERN.test(message) || name === "AuthRetryableFetchError";
}

/** A plain-language message for a network failure, or null if the error is something else. */
export function friendlyNetworkMessage(err: unknown): string | null {
  if (!isNetworkError(err)) return null;
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? "No internet connection. Check your network and try again."
    : "Can't reach the server right now. Please try again in a moment.";
}

export function reportNetworkError() {
  if (restoredTimer) clearTimeout(restoredTimer);
  set(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "server");
}

export function reportSuccess() {
  if (state !== "offline" && state !== "server") return;
  set("restored");
  if (restoredTimer) clearTimeout(restoredTimer);
  restoredTimer = setTimeout(() => {
    if (state === "restored") set("online");
  }, 3000);
}

if (typeof window !== "undefined") {
  window.addEventListener("offline", () => {
    if (restoredTimer) clearTimeout(restoredTimer);
    set("offline");
  });
  window.addEventListener("online", () => {
    // The browser says we are back; the next successful request confirms it.
    if (state === "offline") set("server");
    window.dispatchEvent(new Event("mbs-retry"));
  });
  if (navigator.onLine === false) state = "offline";
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => "online" as ConnectionState,
  );
}