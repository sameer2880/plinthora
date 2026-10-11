/**
 * Google sign-in inside the native Plinthora Android app (Capacitor).
 *
 * Google refuses to sign people in inside an embedded WebView, so the app opens the
 * sign-in in the phone's browser (Chrome Custom Tab). When Google is done, Supabase sends the
 * browser to com.plinthora.app://auth#access_token=...; Android hands that address to the
 * app (intent filter in AndroidManifest.xml), and we pass it on to /auth/google, which
 * finishes the sign-in INSIDE the app (see routes/auth.google.tsx).
 *
 * Needs an APK built with the @capacitor/browser plugin and that intent filter.
 * (File also handles https App Links: see APP_LINK_PATHS below.) In a normal
 * browser, or an older APK, isGoogleSignInInAppAvailable() is false and nothing here runs.
 */
import { supabase } from "@/integrations/supabase/client";

const APP_REDIRECT = "com.plinthora.app://auth";

/**
 * Links shared by WhatsApp / SMS that should open in the installed app instead of the browser
 * (Android "App Links": AndroidManifest.xml intent filter + /.well-known/assetlinks.json).
 * Only these web addresses are accepted, so an outside link can't steer the app anywhere else.
 */
const APP_LINK_HOSTS = ["plinthora.vercel.app"];
const APP_LINK_PATHS = ["/auth/link", "/receipt/"];

type Listener = (event: { url?: string }) => void;

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
  addListener?: (plugin: string, event: string, cb: Listener) => unknown;
  Plugins?: Record<string, { addListener?: (event: string, cb: Listener) => unknown } | undefined>;
};

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

/** True only inside an APK that has the Browser + App plugins. */
export function isNativeApp(): boolean {
  return bridge() !== null;
}

export function isGoogleSignInInAppAvailable(): boolean {
  const cap = bridge();
  if (!cap) return false;
  try {
    return Boolean(cap.isPluginAvailable?.("Browser") && cap.isPluginAvailable?.("App"));
  } catch {
    return false;
  }
}

/** Opens Google sign-in in the phone's browser. Throws if it can't be started. */
export async function startGoogleSignInInApp(): Promise<void> {
  const cap = bridge();
  if (!cap || !isGoogleSignInInAppAvailable()) throw new Error("unavailable");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // The browser comes back to our own website first (an address Supabase already accepts);
      // /auth/google?app=1 then hands the sign-in over to the app (see routes/auth.google.tsx).
      redirectTo: `${window.location.origin}/auth/google?app=1`,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data?.url) throw new Error("start-failed");
  await cap.nativePromise!("Browser", "open", { url: data.url });
}

function handleUrl(cap: CapacitorBridge, raw: string | undefined) {
  if (!raw) return;
  try {
    const u = new URL(raw);

    // Return from Google sign-in (custom scheme).
    if (raw.startsWith(APP_REDIRECT)) {
      void cap.nativePromise?.("Browser", "close", {})?.catch(() => undefined);
      // /auth/google reads the Google session (or error) from the address and finishes the sign-in.
      window.location.assign(`/auth/google${u.search}${u.hash}`);
      return;
    }

    // A sign-in / reset / receipt link opened from WhatsApp etc. (verified https App Link).
    if (u.protocol === "https:" && APP_LINK_HOSTS.includes(u.hostname) && APP_LINK_PATHS.some((p) => u.pathname.startsWith(p))) {
      const target = `${u.pathname}${u.search}${u.hash}`;
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== target) {
        window.location.assign(target);
      }
    }
  } catch {
    /* not a valid address: ignore */
  }
}

let attached = false;

/**
 * Listens for addresses the phone hands to the app: the return from Google sign-in and
 * links opened from WhatsApp etc. Safe to call more than once. Needs the App plugin.
 */
export function listenForAppUrls(): void {
  const cap = bridge();
  if (!cap || attached || !cap.isPluginAvailable?.("App")) return;
  attached = true;

  const onOpen: Listener = (e) => handleUrl(cap, e.url);
  const plugin = cap.Plugins?.App;
  if (plugin?.addListener) plugin.addListener("appUrlOpen", onOpen);
  else cap.addListener?.("App", "appUrlOpen", onOpen);

  // App was closed when the link was tapped: Android starts it with the address.
  void cap
    .nativePromise?.("App", "getLaunchUrl", {})
    ?.then((r) => handleUrl(cap, (r as { url?: string } | undefined)?.url))
    .catch(() => undefined);
}

/** @deprecated kept for older imports; same as listenForAppUrls(). */
export const listenForGoogleReturn = listenForAppUrls;