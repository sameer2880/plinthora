/**
 * Browser notifications for the Plinthora website / installed web app (Chrome, Edge, Firefox,
 * Android Chrome, and the iPhone "Add to Home Screen" app on iOS 16.4+).
 *
 * How it works: after sign-in we ask the browser for permission, get this browser's Firebase
 * (FCM) token and save it with register_push_token (platform "web"). The existing send-push
 * Edge Function then sends to it exactly like it does for phones, and public/sw.js shows the
 * notification even when the site is closed. On sign-out the token is removed.
 *
 * Does nothing inside the native Android app (native-push.ts handles that), in browsers
 * without push support, or until the VITE_FIREBASE_* values below are set.
 *
 * Needs these build-time env vars (Vercel -> Settings -> Environment Variables):
 *   VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID, VITE_FIREBASE_VAPID_KEY
 * (VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_MESSAGING_SENDER_ID default to Plinthora's.)
 */
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Firebase's browser SDK is loaded from Google's CDN on demand, so no npm package is needed. */
const FIREBASE_JS_VERSION = "11.0.2";
const APP_NAME = "plinthora-web-push";
const TOKEN_KEY = "plinthora-web-push-token";
const ASKED_KEY = "plinthora-web-push-asked";
const ASK_AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type LooseRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null }>;
};

type AppModule = {
  initializeApp: (config: object, name?: string) => unknown;
  getApp: (name?: string) => unknown;
};

type MessagingModule = {
  isSupported: () => Promise<boolean>;
  getMessaging: (app: unknown) => unknown;
  getToken: (
    messaging: unknown,
    options: { vapidKey: string; serviceWorkerRegistration?: ServiceWorkerRegistration },
  ) => Promise<string>;
  deleteToken: (messaging: unknown) => Promise<boolean>;
};

function settings() {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    firebase: {
      apiKey: env.VITE_FIREBASE_API_KEY,
      appId: env.VITE_FIREBASE_APP_ID,
      projectId: env.VITE_FIREBASE_PROJECT_ID || "plinthora",
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "8540682004",
    },
    vapidKey: env.VITE_FIREBASE_VAPID_KEY,
  };
}

function inNativeApp(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

function available(): boolean {
  if (typeof window === "undefined" || inNativeApp()) return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return false;
  }
  const s = settings();
  return !!(s.firebase.apiKey && s.firebase.appId && s.vapidKey);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

let loading: Promise<{ mod: MessagingModule; messaging: unknown }> | null = null;

function firebaseMessaging() {
  if (!loading) {
    loading = (async () => {
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_JS_VERSION}`;
      const [appMod, mod] = await Promise.all([
        import(/* @vite-ignore */ `${base}/firebase-app.js`) as Promise<AppModule>,
        import(/* @vite-ignore */ `${base}/firebase-messaging.js`) as Promise<MessagingModule>,
      ]);
      if (!(await mod.isSupported())) throw new Error("push is not supported in this browser");
      let app: unknown;
      try {
        app = appMod.getApp(APP_NAME);
      } catch {
        app = appMod.initializeApp(settings().firebase, APP_NAME);
      }
      return { mod, messaging: mod.getMessaging(app) };
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

let saving: Promise<void> | null = null;

/** Get this browser's token and save it. Needs notification permission to be granted already. */
function fetchAndSaveToken(): Promise<void> {
  if (!saving) {
    saving = (async () => {
      const registration = await withTimeout(navigator.serviceWorker.ready, 15000);
      if (!registration) return;
      const { mod, messaging } = await firebaseMessaging();
      const token = await mod.getToken(messaging, {
        vapidKey: settings().vapidKey as string,
        serviceWorkerRegistration: registration,
      });
      if (!token) return;
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch {
        /* ignore */
      }
      const { error } = await (supabase as unknown as LooseRpc).rpc("register_push_token", {
        p_token: token,
        p_platform: "web",
      });
      if (error) console.warn("[web-push] could not save token:", error.message);
    })().finally(() => {
      saving = null;
    });
  }
  return saving;
}

/** Ask once (and again after a week) with a small toast; the click is the user gesture. */
function askOnce() {
  try {
    const last = Number(localStorage.getItem(ASKED_KEY) || 0);
    if (Date.now() - last < ASK_AGAIN_AFTER_MS) return;
    localStorage.setItem(ASKED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  toast("Get alerts for new rentals and updates?", {
    description: "Turn on notifications to see them even when Plinthora is closed.",
    duration: 20000,
    action: {
      label: "Turn on",
      onClick: () => {
        void enableWebPush();
      },
    },
  });
}

/** Safe to call after every sign-in. Registers silently if allowed, otherwise asks politely. */
export async function registerWebPush(): Promise<void> {
  try {
    if (!available()) return;
    if (Notification.permission === "denied") return;
    if (Notification.permission === "granted") {
      await fetchAndSaveToken();
      return;
    }
    askOnce();
  } catch (err) {
    console.warn("[web-push] not available:", err);
  }
}

/** For a "Turn on notifications" button: asks the browser for permission, then registers. */
export async function enableWebPush(): Promise<"granted" | "denied" | "unsupported"> {
  if (!available()) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    if (result !== "granted") {
      toast.info("Notifications are blocked. Allow them in your browser's site settings.");
      return "denied";
    }
    await fetchAndSaveToken();
    toast.success("Notifications are on");
    return "granted";
  } catch (err) {
    console.warn("[web-push] could not turn on:", err);
    toast.error("Could not turn on notifications. Please try again.");
    return "denied";
  }
}

/** Remove this browser from the database (call before signing out). Never throws, never hangs. */
export async function unregisterWebPush(): Promise<void> {
  if (typeof window === "undefined" || inNativeApp()) return;
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  if (!token) return;

  try {
    await withTimeout(
      Promise.resolve(
        (supabase as unknown as LooseRpc).rpc("unregister_push_token", { p_token: token }),
      ),
      3000,
    );
    if (available()) {
      const { mod, messaging } = await firebaseMessaging();
      await withTimeout(mod.deleteToken(messaging).catch(() => false), 2000);
    }
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