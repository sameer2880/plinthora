import { MapPin, MapPinOff, MapPinned } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useWorkerLocationSharing, WORK_HOURS_LABEL } from "@/hooks/use-worker-location-sharing";
import { openNativeAppSettings, requestNativeBatteryExemption } from "@/lib/native-location";
import { cn } from "@/lib/utils";

export function WorkerLocationToggle({ workerId }: { workerId: string | null }) {
  const {
    enabled,
    status,
    errorMessage,
    toggle,
    loaded,
    native,
    permission,
    batteryUnrestricted,
    diagnostics,
  } = useWorkerLocationSharing(workerId);

  if (!workerId) return null;

  const statusText =
    status === "sharing"
      ? native
        ? "Sharing your live location, even when the app is closed (updates every minute)"
        : "Sharing your live location (updates every minute)"
      : status === "paused"
        ? "Auto-resumes when working hours start"
        : status === "error"
          ? errorMessage || "Couldn't access your location"
          : "Location sharing is off for now";

  // Minutes since the phone's background service last got a position to the server.
  const lastOkMinutes =
    diagnostics && diagnostics.lastOkAt > 0
      ? Math.max(0, Math.round((diagnostics.now - diagnostics.lastOkAt) / 60_000))
      : null;

  const Icon = status === "sharing" ? MapPinned : status === "error" ? MapPinOff : MapPin;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-colors",
        status === "sharing"
          ? "border-primary/40 bg-primary/5"
          : status === "error"
            ? "border-destructive/40 bg-destructive/5"
            : "border-sidebar-border",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              status === "sharing"
                ? "text-primary"
                : status === "error"
                  ? "text-destructive"
                  : "text-sidebar-foreground/70",
            )}
          />

          <span className="truncate text-sm font-semibold">Share My Location</span>
        </div>

        <Switch
          checked={enabled}
          disabled={!loaded}
          onCheckedChange={() => {
            void toggle();
          }}
          aria-label="Toggle live location sharing"
        />
      </div>

      <p
        className={cn(
          "mt-1.5 text-[11px] leading-snug",
          status === "error" ? "text-destructive" : "text-sidebar-foreground/65",
        )}
      >
        {statusText}
      </p>

      {native && enabled && status === "sharing" && permission === "foreground" && (
        <p className="mt-1 text-[11px] font-medium leading-snug text-amber-600">
          To keep sharing when the app is closed, open phone Settings → Apps → Plinthora →
          Permissions → Location → &quot;Allow all the time&quot;.
        </p>
      )}

      {native && enabled && status === "sharing" && batteryUnrestricted === false && (
        <div className="mt-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="text-[11px] font-medium leading-snug text-amber-600">
            Your phone may pause location a few minutes after you close the app. Tap below and
            choose &quot;Allow&quot; so tracking keeps running.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={requestNativeBatteryExemption}
              className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-black"
            >
              Allow background running
            </button>
            <button
              type="button"
              onClick={openNativeAppSettings}
              className="rounded-md border border-amber-500/60 px-2 py-1 text-[11px] font-semibold text-amber-600"
            >
              Open app settings
            </button>
          </div>
        </div>
      )}

      {native && enabled && status === "sharing" && diagnostics && (
        <p className="mt-1 text-[10px] leading-snug text-sidebar-foreground/60">
          {lastOkMinutes === null
            ? "Waiting for the first location to reach the server…"
            : lastOkMinutes === 0
              ? "Last sent to server: just now"
              : `Last sent to server: ${lastOkMinutes} min ago`}
          {diagnostics.lastResult && !diagnostics.lastResult.startsWith("OK")
            ? ` · ${diagnostics.lastResult}`
            : ""}
        </p>
      )}

      <p className="mt-0.5 text-[10px] leading-snug text-sidebar-foreground/50">
        Turns on automatically each day. Visible to admins only between {WORK_HOURS_LABEL}.
      </p>
    </div>
  );
}