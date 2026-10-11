/**
 * Phone "Back" button / back-swipe inside the native Plinthora Android app (Capacitor).
 *
 * Without this the app either does nothing or leaves the page on the wrong screen. Rules:
 *  1. A dialog, sheet, menu or the "More" panel is open  -> Back closes it.
 *  2. On a normal page                                   -> Back goes to the previous page.
 *  3. On the home screen (dashboard / worker / platform)  -> press Back twice to exit the app.
 *  4. On a sign-in link page (/auth/...)                  -> Back goes home, never back into sign-in.
 *
 * Works with the App plugin that is already in the installed APK, so no new APK is needed.
 * Does nothing in a normal browser.
 */
import { toast } from "sonner";

type Listener = (event: { canGoBack?: boolean }) => void;

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
  addListener?: (plugin: string, event: string, cb: Listener) => unknown;
  Plugins?: Record<string, { addListener?: (event: string, cb: Listener) => unknown } | undefined>;
};

/** Screens where Back should exit the app instead of going to an earlier page. */
const HOME_PATHS = new Set(["/", "/dashboard", "/worker", "/platform/businesses"]);
const EXIT_WINDOW_MS = 2000;

/** Anything on screen that Back should close first. */
const OPEN_OVERLAY =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], ' +
  '[role="menu"][data-state="open"], [role="listbox"][data-state="open"], .more-panel';

function bridge(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  if (!cap || typeof cap.nativePromise !== "function") return null;
  try {
    if (cap.isNativePlatform && !cap.isNativePlatform()) return null;
  } catch {
    return null;
  }
  return cap;
}

let attached = false;
let lastBackAt = 0;

export function listenForBackButton(): void {
  const cap = bridge();
  if (!cap || attached || !cap.isPluginAvailable?.("App")) return;
  attached = true;

  const onBack: Listener = (event) => {
    // 1. Close whatever is open on top of the page (the pages already close on Escape).
    if (document.querySelector(OPEN_OVERLAY)) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return;
    }

    const path = window.location.pathname.replace(/\/+$/, "") || "/";

    // 4. Sign-in / reset link pages are one-way: go home instead of back into them.
    if (path.startsWith("/auth/")) {
      window.location.replace("/dashboard");
      return;
    }

    // 3. Home screen: press twice to exit.
    if (HOME_PATHS.has(path)) {
      const now = Date.now();
      if (now - lastBackAt < EXIT_WINDOW_MS) {
        void cap.nativePromise?.("App", "exitApp", {})?.catch(() => undefined);
        return;
      }
      lastBackAt = now;
      toast("Press back again to exit", { duration: EXIT_WINDOW_MS });
      return;
    }

    // 2. Any other page: go back; if there is nothing earlier (opened from a link), go home.
    if (event?.canGoBack) window.history.back();
    else window.location.replace("/dashboard");
  };

  const plugin = cap.Plugins?.App;
  if (plugin?.addListener) plugin.addListener("backButton", onBack);
  else cap.addListener?.("App", "backButton", onBack);
}