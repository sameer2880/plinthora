import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  MapPinned,
  RadioTower,
  Clock,
  ExternalLink,
  RefreshCw,
  Phone,
  Plus,
  Minus,
  Maximize2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isWithinWorkingHours, WORK_HOURS_LABEL } from "@/hooks/use-worker-location-sharing";
import { AdminOnly } from "@/components/AdminOnly";
import { isMasterAdmin } from "@/lib/auth/access";
import { PLATFORM_NAME } from "@/lib/brand";
import { LoadingBlock } from "@/components/LoadingScreen";

export const Route = createFileRoute("/_authenticated/worker-locations")({
  head: () => ({
    meta: [
      { title: `Worker Locations — ${PLATFORM_NAME}` },
      {
        name: "description",
        content: "Live GPS locations of workers who have location sharing turned on.",
      },
    ],
  }),
  component: WorkerLocationsPage,
});

// A worker is treated as "live" if we heard from them in the last 3
// minutes — after that their pin is shown as stale/offline.
const LIVE_THRESHOLD_MS = 3 * 60 * 1000;

// Poll for fresh positions every 15s while this page is open.
const REFRESH_INTERVAL_MS = 15_000;

const DEFAULT_ZOOM = 17;
const MIN_ZOOM = 3;
const MAX_ZOOM = 21;

type WorkerLocationRow = {
  worker_id: string;
  name: string;
  active: boolean;
  phone: string | null;
  sharing_enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  updated_at: string | null;
};

function WorkerLocationsPage() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const withinHours = isWithinWorkingHours(now);

  // Worker whose big map card is open (stored by id so it stays fresh
  // with the 15s refresh) + the current zoom level of that big map.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const openWorker = (id: string) => {
    setZoom(DEFAULT_ZOOM);
    setSelectedId(id);
  };

  const {
    data: rows = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["worker-locations-admin"],
    refetchInterval: REFRESH_INTERVAL_MS,
    queryFn: async () => {
      const [{ data: workers, error: workersError }, { data: locations, error: locationsError }] =
        await Promise.all([
          supabase
            .from("workers")
            .select("id, name, active, role, phone")
            .eq("role", "worker")
            .order("name"),
          supabase
            .from("worker_locations")
            .select("worker_id, sharing_enabled, latitude, longitude, accuracy_m, updated_at"),
        ]);

      if (workersError) throw workersError;
      if (locationsError) throw locationsError;

      const locationMap = new Map(
        (locations ?? []).map((location) => [location.worker_id, location]),
      );

      const merged: WorkerLocationRow[] = (workers ?? [])
        .filter((worker) => worker.active && worker.role === "worker")
        .map((worker) => {
          const location = locationMap.get(worker.id);
          return {
            worker_id: worker.id,
            name: worker.name,
            active: worker.active,
            phone: worker.phone ?? null,
            sharing_enabled: Boolean(location?.sharing_enabled),
            latitude: location?.latitude ?? null,
            longitude: location?.longitude ?? null,
            accuracy_m: location?.accuracy_m ?? null,
            updated_at: location?.updated_at ?? null,
          };
        });

      // Sharing-and-live workers first, then sharing-but-stale, then off.
      merged.sort((a, b) => {
        const rank = (row: WorkerLocationRow) => {
          if (!row.sharing_enabled || !row.latitude || !row.updated_at) return 2;
          const isLive = Date.now() - new Date(row.updated_at).getTime() < LIVE_THRESHOLD_MS;
          return isLive ? 0 : 1;
        };
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });

      return merged;
    },
    enabled: isMasterAdmin(),
  });

  const selected =
    rows.find(
      (row) => row.worker_id === selectedId && row.latitude != null && row.longitude != null,
    ) ?? null;
  const selectedLive =
    selected?.updated_at != null &&
    Date.now() - new Date(selected.updated_at).getTime() < LIVE_THRESHOLD_MS;

  const liveCount = rows.filter(
    (row) =>
      row.sharing_enabled &&
      row.latitude != null &&
      row.updated_at &&
      Date.now() - new Date(row.updated_at).getTime() < LIVE_THRESHOLD_MS,
  ).length;

  return (
    <AdminOnly label="Worker Locations">
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <MapPinned className="h-5 w-5 text-primary" /> Worker Locations
          </h2>
          <p className="text-sm text-muted-foreground">
            Live GPS location of workers who have turned location sharing on.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="default"
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <Clock className="h-3 w-3" />
            24-hour tracking
          </Badge>

          <Badge variant="outline" className="h-8 gap-1.5 px-3 text-xs">
            <RadioTower className="h-3 w-3 text-primary" />
            {liveCount} live
          </Badge>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNow(new Date());
              void refetch();
            }}
            disabled={isFetching}
            className="h-8 !min-h-0 gap-1.5 px-3 text-xs font-semibold"
          >
            <RefreshCw className={cn("!size-3 text-primary", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="py-3 text-sm text-muted-foreground">
          Live tracking is active <span className="font-semibold">{WORK_HOURS_LABEL}</span> across the day,
          so worker locations remain available without a shutdown window.
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingBlock title="Loading worker locations…" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No active workers found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const hasFix = row.sharing_enabled && row.latitude != null && row.longitude != null;
            const isLive =
              hasFix &&
              row.updated_at &&
              Date.now() - new Date(row.updated_at).getTime() < LIVE_THRESHOLD_MS;

            const mapsUrl = hasFix
              ? `https://www.google.com/maps?q=${row.latitude},${row.longitude}&t=h`
              : null;

            const embedUrl = hasFix
              ? `https://maps.google.com/maps?q=${row.latitude},${row.longitude}&z=18&t=h&output=embed`
              : null;

            return (
              <Card key={row.worker_id} className="overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 pt-4">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{row.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {hasFix && row.updated_at
                        ? `Updated ${formatDistanceToNow(new Date(row.updated_at), { addSuffix: true })}`
                        : row.sharing_enabled
                          ? "Waiting for first GPS fix..."
                          : "Location sharing is off"}
                    </div>
                  </div>

                  <Badge
                    variant={isLive ? "default" : hasFix ? "secondary" : "outline"}
                    className="shrink-0"
                  >
                    {isLive ? "Live" : hasFix ? "Stale" : "Off"}
                  </Badge>
                </div>

                <CardContent className="p-4">
                  {hasFix && embedUrl ? (
                    <div className="group relative overflow-hidden rounded-lg border">
                      <iframe
                        title={`${row.name} location`}
                        src={embedUrl}
                        className="h-56 w-full sm:h-64"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                      {/* Transparent layer so a tap opens the big card */}
                      <button
                        type="button"
                        onClick={() => openWorker(row.worker_id)}
                        aria-label={`Open ${row.name} location in a bigger view`}
                        className="absolute inset-0 flex cursor-pointer items-end justify-end bg-transparent p-2"
                      >
                        <span className="flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold shadow">
                          <Maximize2 className="h-3 w-3" /> Tap to expand
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground sm:h-64">
                      No location available
                    </div>
                  )}

                  {hasFix && mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
                    >
                      Open in Google Maps
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="flex h-[92dvh] max-w-4xl flex-col gap-3 overflow-hidden p-3 sm:p-4">
          {selected && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="flex items-center gap-2">
                  {selected.name}
                  <Badge
                    variant={selectedLive ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {selectedLive ? "Live" : "Stale"}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {selected.updated_at
                    ? `Updated ${formatDistanceToNow(new Date(selected.updated_at), { addSuffix: true })}`
                    : "Location"}
                  {selected.accuracy_m != null && ` · accuracy ±${Math.round(selected.accuracy_m)} m`}
                </DialogDescription>
              </DialogHeader>

              <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border">
                <iframe
                  key={`${selected.latitude},${selected.longitude},${zoom}`}
                  title={`${selected.name} location (large)`}
                  src={`https://maps.google.com/maps?q=${selected.latitude},${selected.longitude}&z=${zoom}&t=h&output=embed`}
                  className="h-full w-full"
                  referrerPolicy="no-referrer-when-downgrade"
                />

                <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border bg-background shadow-md">
                  <button
                    type="button"
                    aria-label="Zoom in"
                    onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
                    disabled={zoom >= MAX_ZOOM}
                    className="flex h-10 w-10 items-center justify-center hover:bg-muted disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <div className="h-px bg-border" />
                  <button
                    type="button"
                    aria-label="Zoom out"
                    onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
                    disabled={zoom <= MIN_ZOOM}
                    className="flex h-10 w-10 items-center justify-center hover:bg-muted disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {selected.phone ? (
                  <a
                    href={`tel:${selected.phone.replace(/[^\d+]/g, "")}`}
                    className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Phone className="h-4 w-4" />
                    Call {selected.name} · {selected.phone}
                  </a>
                ) : (
                  <div className="flex items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    No phone number saved
                  </div>
                )}
                <a
                  href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}&t=h`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-md border px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  Open in Google Maps
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </AdminOnly>
  );
}