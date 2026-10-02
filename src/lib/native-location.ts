/**
 * Background location for the native Plinthora Android app.
 *
 * A WebView stops running JavaScript the moment the app is closed, so the browser
 * geolocation used by the web app cannot report a position then. Inside the Android app we
 * instead hand the job to a native foreground service (LocationTrackingService) that keeps
 * running with the app closed and posts each GPS fix to the `location-ping` Edge Function.
 *
 * The native side is exposed as `window.PlinthoraNative` (see PlinthoraNativeBridge.java).
 * In a normal browser, a PWA, or an older APK, every function here does nothing and the web
 * app keeps using browser geolocation as before.
 */
import { supabase } from "@/integrations/supabase/client";

type NativeLocationBridge = {
  startLocationService?: (token: string, endpoint: string, workerId: string) => void;
  stopLocationService?: () => void;
  clearLocationToken?: () => void;
  getLocationToken?: () => string;
  getLocationWorkerId?: () => string;
  /** "always" | "foreground" | "denied" */
  getLocationPermissionState?: () => string;
  /** Added in app v1.0.3 - older APKs don't have these, so every call is guarded. */
  isBatteryOptimizationIgnored?: () => boolean;
  requestBatteryOptimizationExemption?: () => void;
  openAppSettings?: () => void;
  getLocationDiagnostics?: () => string;
};

type LooseRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

function nativeBridge(): NativeLocationBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { PlinthoraNative?: NativeLocationBridge }).PlinthoraNative;
  return b && typeof b.startLocationService === "function" ? b : null;
}

/** True only inside the Android app build that includes the background location service. */
export function isNativeLocationAvailable(): boolean {
  return nativeBridge() !== null;
}

export type NativeLocationPermission = "always" | "foreground" | "denied" | "unknown";

export function nativeLocationPermission(): NativeLocationPermission {
  const b = nativeBridge();
  if (!b?.getLocationPermissionState) return "unknown";
  try {
    const state = b.getLocationPermissionState();
    return state === "always" || state === "foreground" || state === "denied" ? state : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Starts the background service for this worker. The first call on a phone creates a device
 * token (register_location_device) and hands it to the native side; later calls just make
 * sure the service is running. Never throws.
 */
export async function startNativeLocation(workerId: string): Promise<boolean> {
  const b = nativeBridge();
  if (!b) return false;

  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!url) return false;
    const endpoint = `${url.replace(/\/$/, "")}/functions/v1/location-ping`;

    // Keep the existing token if this phone already has one for this same worker.
    let token = "";
    const sameWorker = b.getLocationWorkerId?.() === workerId;
    const hasToken = sameWorker && (b.getLocationToken?.() ?? "") !== "";
    if (!hasToken) {
      const { data, error } = await (supabase as unknown as LooseRpc).rpc("register_location_device");
      if (error || typeof data !== "string" || !data) {
        console.warn("[location] could not register this phone:", error?.message);
        return false;
      }
      token = data;
    }

    b.startLocationService!(token, endpoint, workerId);
    return true;
  } catch (err) {
    console.warn("[location] background service not available:", err);
    return false;
  }
}

/** Pause: stops the service but keeps the token so turning sharing back on is instant. */
export function pauseNativeLocation(): void {
  try {
    nativeBridge()?.stopLocationService?.();
  } catch {
    /* ignore */
  }
}

/** Sign-out: stops the service, forgets the token on the phone and revokes it on the server. */
export async function stopNativeLocation(): Promise<void> {
  const b = nativeBridge();
  if (!b) return;

  let token = "";
  try {
    token = b.getLocationToken?.() ?? "";
  } catch {
    /* ignore */
  }

  try {
    b.stopLocationService?.();
    b.clearLocationToken?.();
  } catch {
    /* ignore */
  }

  if (!token) return;
  try {
    await Promise.race([
      Promise.resolve(
        (supabase as unknown as LooseRpc).rpc("unregister_location_device", { p_token: token }),
      ),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    /* best effort */
  }
}

/**
 * Is Android allowed to put the app to sleep in the background? `false` means Doze will cut
 * location after a few minutes of the phone sitting idle. `null` = unknown / older APK.
 */
export function nativeBatteryUnrestricted(): boolean | null {
  const b = nativeBridge();
  if (!b?.isBatteryOptimizationIgnored) return null;
  try {
    return b.isBatteryOptimizationIgnored();
  } catch {
    return null;
  }
}

/** Shows Android's "allow background activity" dialog. Call from a button tap. */
export function requestNativeBatteryExemption(): void {
  try {
    nativeBridge()?.requestBatteryOptimizationExemption?.();
  } catch {
    /* ignore */
  }
}

/** Opens the app's page in the phone's Settings (auto-start / battery switches live there). */
export function openNativeAppSettings(): void {
  try {
    nativeBridge()?.openAppSettings?.();
  } catch {
    /* ignore */
  }
}

export type NativeLocationDiagnostics = {
  /** Phone clock (ms) of the last upload the server accepted, 0 if none yet. */
  lastOkAt: number;
  /** Phone clock (ms) of the background service's last heartbeat, 0 if it never ran. */
  lastBeatAt: number;
  /** Text about the last upload attempt, e.g. "OK (HTTP 200)" or "Network error: ...". */
  lastResult: string;
  /** Phone clock (ms) when this snapshot was taken. */
  now: number;
};

/** What the phone's background service is really doing. `null` on an older APK. */
export function nativeLocationDiagnostics(): NativeLocationDiagnostics | null {
  const b = nativeBridge();
  if (!b?.getLocationDiagnostics) return null;
  try {
    const raw = JSON.parse(b.getLocationDiagnostics() || "{}") as Partial<NativeLocationDiagnostics>;
    return {
      lastOkAt: Number(raw.lastOkAt) || 0,
      lastBeatAt: Number(raw.lastBeatAt) || 0,
      lastResult: typeof raw.lastResult === "string" ? raw.lastResult : "",
      now: Number(raw.now) || Date.now(),
    };
  } catch {
    return null;
  }
}