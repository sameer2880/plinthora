/**
 * Phone push notifications for the native Plinthora Android app (Capacitor).
 *
 * Inside the app, `window.Capacitor` is injected by the native shell and exposes the
 * `PushNotifications` plugin. After a manager / admin signs in we ask Android for permission,
 * get this phone's Firebase token and save it in the database (register_push_token). The
 * `send-push` Edge Function then sends a notification to it whenever something is added,
 * modified or deleted, and Android shows it in the notification center - even when the app is
 * closed. On sign-out the token is removed so a signed-out phone stops receiving alerts.
 *
 * In a normal browser, a PWA, or an APK built without the plugin, every function here does
 * nothing.
 */
import { supabase } from "@/integrations/supabase/client";

const TOKEN_KEY = "mbs-push-token";
const PLUGIN = "PushNotifications";

type Listener = (event: { value?: string; error?: string }) => void;

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
  addListener?: (plugin: string, event: string, cb: Listener) => unknown;
  Plugins?: Record<
    string,
    { addListener?: (event: string, cb: Listener) => unknown } | undefined
  >;
};

type LooseRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
};

function bridge(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  if (!cap || typeof cap.nativePromise !== "function") return null;
  try {
    if (cap.isNativePlatform && !cap.isNativePlatform()) return null;
    if (cap.getPlatform && cap.getPlatform() !== "android") return null;
  } catch {
    return null;
  }
  return cap;
}

function call(cap: CapacitorBridge, method: string, options: unknown = {}) {
  return cap.nativePromise!(PLUGIN, method, options);
}

function listen(cap: CapacitorBridge, event: string, cb: Listener) {
  const plugin = cap.Plugins?.[PLUGIN];
  if (plugin?.addListener) return plugin.addListener(event, cb);
  return cap.addListener?.(PLUGIN, event, cb);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

let listenersAttached = false;

async function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
  const { error } = await (supabase as unknown as LooseRpc).rpc("register_push_token", {
    p_token: token,
    p_platform: "android",
  });
  if (error) console.warn("[push] could not save token:", error.message);
}

/** Ask for permission (Android 13+) and register this phone. Safe to call repeatedly. */
export async function registerNativePush(): Promise<void> {
  const cap = bridge();
  if (!cap) return;

  try {
    if (!listenersAttached) {
      listenersAttached = true;
      listen(cap, "registration", (e) => {
        if (e.value) void saveToken(e.value);
      });
      listen(cap, "registrationError", (e) => {
        console.warn("[push] registration failed:", e.error);
      });
    }

    const current = (await call(cap, "checkPermissions")) as { receive?: string };
    let granted = current?.receive === "granted";
    if (!granted) {
      const asked = (await call(cap, "requestPermissions")) as { receive?: string };
      granted = asked?.receive === "granted";
    }
    if (!granted) return;

    await call(cap, "register");
  } catch (err) {
    // An older app build without the plugin, or any other native-bridge problem:
    // the web app keeps working, it just won't get phone alerts.
    console.warn("[push] not available:", err);
  }
}

/** Remove this phone from the database (call before signing out). Never throws, never hangs. */
export async function unregisterNativePush(): Promise<void> {
  const cap = bridge();
  if (!cap) return;

  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }

  try {
    if (token) {
      await withTimeout(
        Promise.resolve(
          (supabase as unknown as LooseRpc).rpc("unregister_push_token", { p_token: token }),
        ),
        3000,
      );
    }
    // Also drop Firebase's token so the next sign-in on this phone gets a fresh one.
    await withTimeout(call(cap, "unregister").catch(() => undefined), 2000);
  } catch {
    /* best effort */
  } finally {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
}