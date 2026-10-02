import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isNativeLocationAvailable,
  nativeBatteryUnrestricted,
  nativeLocationDiagnostics,
  nativeLocationPermission,
  pauseNativeLocation,
  startNativeLocation,
  type NativeLocationDiagnostics,
  type NativeLocationPermission,
} from "@/lib/native-location";

/* ================================
   WORKING HOURS WINDOW
   4:30 AM - 9:00 PM
   (keep in step with WORK_START_MIN / WORK_END_MIN in
   LocationTrackingService.java in the Android app)
   ================================ */
const WORK_START_MINUTES = 4 * 60 + 30;
const WORK_END_MINUTES = 21 * 60;

// How often we send a fresh location while sharing is active. A worker's
// position gets pushed at least this often even if they haven't moved,
// since watchPosition alone can go quiet for a stationary device.
const UPDATE_INTERVAL_MS = 60_000;

// Re-checks the working-hours window so sharing pauses / resumes on its own.
const HOURS_CHECK_INTERVAL_MS = 30_000;

// Native app only: if the phone's background service has not delivered a position for this
// long while it should be sharing, the app nudges it awake again (it self-heals on open).
const NATIVE_STALE_MS = 3 * 60_000;

export function isWithinWorkingHours(date: Date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= WORK_START_MINUTES && minutes < WORK_END_MINUTES;
}

export const WORK_HOURS_LABEL = "4:30 AM – 9:00 PM";

export type LocationSharingStatus =
  | "idle" // off
  | "sharing" // on + within working hours + sending updates
  | "paused" // on but outside working hours, so nothing is being sent
  | "error"; // on but geolocation failed (permission denied, etc.)

type Coords = {
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
};

export function useWorkerLocationSharing(workerId: string | null) {
  // Sharing is ON by default — workers don't need to flip anything for
  // tracking to run during working hours. The switch is there so a
  // worker can pause it for the current session if they want to.
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<LocationSharingStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Inside the Android app a native foreground service does the tracking, so it keeps
  // reporting with the app closed. In a browser / PWA we fall back to browser geolocation.
  const [native, setNative] = useState(false);
  const [permission, setPermission] = useState<NativeLocationPermission>("unknown");
  // false = Android may put the app to sleep in the background (Doze), which is what stops
  // tracking a few minutes after the app is closed. null = unknown / older APK.
  const [batteryUnrestricted, setBatteryUnrestricted] = useState<boolean | null>(null);
  const [diagnostics, setDiagnostics] = useState<NativeLocationDiagnostics | null>(null);
  useEffect(() => {
    setNative(isNativeLocationAvailable());
  }, []);

  const watchIdRef = useRef<number | null>(null);
  const lastWriteRef = useRef(0);
  const lastCoordsRef = useRef<Coords | null>(null);

  /* ================================
     LOAD LAST KNOWN POSITION
     (sharing itself always starts enabled — this just seeds the map
     with the last known fix while we wait for a fresh one)
     ================================ */
  useEffect(() => {
    if (!workerId) {
      setLoaded(true);
      return;
    }

    let cancelled = false;

    void supabase
      .from("worker_locations")
      .select("latitude, longitude, accuracy_m")
      .eq("worker_id", workerId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;

        if (data?.latitude != null && data?.longitude != null) {
          lastCoordsRef.current = {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy_m: data.accuracy_m,
          };
        }

        setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [workerId]);

  /* ================================
     WRITE HELPER
     ================================ */
  const writeRow = useCallback(
    async (patch: { sharing_enabled?: boolean; coords?: Coords }) => {
      if (!workerId) return;

      if (patch.coords) lastCoordsRef.current = patch.coords;

      const coords = lastCoordsRef.current;

      const { error } = await supabase.from("worker_locations").upsert(
        {
          worker_id: workerId,
          ...(patch.sharing_enabled !== undefined
            ? { sharing_enabled: patch.sharing_enabled }
            : {}),
          ...(coords
            ? {
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy_m: coords.accuracy_m,
              }
            : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "worker_id" },
      );

      if (error) throw error;
    },
    [workerId],
  );

  const sendFix = useCallback(
    (position: GeolocationPosition) => {
      lastWriteRef.current = Date.now();
      setErrorMessage(null);
      setStatus("sharing");

      void writeRow({
        sharing_enabled: true,
        coords: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_m: position.coords.accuracy ?? null,
        },
      }).catch(() => {
        // Non-fatal: we'll retry on the next tick.
      });
    },
    [writeRow],
  );

  const handleGeoError = useCallback((geoError: GeolocationPositionError) => {
    setErrorMessage(
      geoError.code === geoError.PERMISSION_DENIED
        ? "Location permission was denied. Enable it in your browser/app settings to share your location."
        : "Could not get your location. Make sure GPS is turned on.",
    );
    setStatus("error");
  }, []);

  /* ================================
     GEOLOCATION: WATCH (for responsiveness) +
     FORCED TICK EVERY MINUTE (guarantees a fresh
     ping even when the device hasn't moved)
     ================================ */
  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startWatch = useCallback(() => {
    if (watchIdRef.current !== null) return;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErrorMessage("Location is not supported on this device.");
      setStatus("error");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!isWithinWorkingHours()) {
          setStatus("paused");
          return;
        }

        // watchPosition can fire often while moving — still only write
        // at most once a minute so we don't hammer the database.
        if (Date.now() - lastWriteRef.current < UPDATE_INTERVAL_MS) return;
        sendFix(position);
      },
      handleGeoError,
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 25_000 },
    );
  }, [handleGeoError, sendFix]);

  // Forces one fresh fix a minute, independent of watchPosition, so a
  // stationary worker's "last updated" time never goes stale beyond 60s.
  useEffect(() => {
    if (!loaded || !enabled || native) return;

    const tick = () => {
      if (!isWithinWorkingHours()) {
        setStatus("paused");
        return;
      }

      if (typeof navigator === "undefined" || !navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(sendFix, handleGeoError, {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      });
    };

    tick();
    const interval = window.setInterval(tick, UPDATE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [enabled, loaded, native, sendFix, handleGeoError]);

  /* ================================
     REACT TO enabled TOGGLING +
     WORKING-HOURS BOUNDARY
     ================================ */
  useEffect(() => {
    if (!loaded || native) return;

    if (!enabled) {
      stopWatch();
      setStatus("idle");
      return;
    }

    const sync = () => {
      if (isWithinWorkingHours()) {
        startWatch();
        setStatus((current) => (current === "error" ? current : "sharing"));
      } else {
        stopWatch();
        setStatus("paused");
      }
    };

    sync();
    const interval = window.setInterval(sync, HOURS_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [enabled, loaded, native, startWatch, stopWatch]);

  /* ================================
     NATIVE ANDROID APP: BACKGROUND SERVICE
     Starts the foreground location service (works with the app closed) and keeps the
     on-screen status in step with the phone's location permission.
     ================================ */
  useEffect(() => {
    if (!loaded || !native || !workerId) return;

    if (!enabled) {
      pauseNativeLocation();
      setStatus("idle");
      return;
    }

    let cancelled = false;

    let lastNudgeAt = 0;

    const refresh = () => {
      const state = nativeLocationPermission();
      setPermission(state);
      setBatteryUnrestricted(nativeBatteryUnrestricted());

      const diag = nativeLocationDiagnostics();
      setDiagnostics(diag);

      // Self-heal: the service should have uploaded within the last few minutes. If it has
      // not, ask the phone to (re)start it - no-op when it is already running.
      if (
        diag &&
        state !== "denied" &&
        isWithinWorkingHours() &&
        diag.now - diag.lastOkAt > NATIVE_STALE_MS &&
        Date.now() - lastNudgeAt > 60_000
      ) {
        lastNudgeAt = Date.now();
        void startNativeLocation(workerId);
      }

      if (!isWithinWorkingHours()) {
        // The phone's service idles outside working hours and resumes by itself.
        setErrorMessage(null);
        setStatus("paused");
      } else if (state === "denied") {
        setErrorMessage(
          "Location permission was denied. Allow location for Plinthora in your phone's Settings.",
        );
        setStatus("error");
      } else {
        setErrorMessage(null);
        setStatus("sharing");
      }
    };

    void startNativeLocation(workerId).then((ok) => {
      if (cancelled) return;
      if (!ok) {
        setErrorMessage("Couldn't start background location sharing. Check your connection.");
        setStatus("error");
        return;
      }
      refresh();
    });

    // The permission screens are answered outside the web page, so poll for the result.
    const interval = window.setInterval(refresh, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled, loaded, native, workerId]);

  // Always stop the watch on unmount.
  useEffect(() => stopWatch, [stopWatch]);

  /* ================================
     PUBLIC TOGGLE (manual pause / resume)
     ================================ */
  const toggle = useCallback(async () => {
    if (!workerId) return;

    const next = !enabled;
    setEnabled(next);
    setErrorMessage(null);

    try {
      await writeRow({ sharing_enabled: next });
    } catch {
      // Reflect failure by reverting the switch.
      setEnabled(!next);
      setErrorMessage("Couldn't update location sharing. Check your connection and try again.");
    }
  }, [enabled, workerId, writeRow]);

  return {
    enabled,
    status,
    errorMessage,
    toggle,
    loaded,
    native,
    permission,
    batteryUnrestricted,
    diagnostics,
  };
}