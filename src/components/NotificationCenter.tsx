import { useEffect, useState } from "react";
import { Bell, CheckCheck, Pencil, Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth/session";
import {
  activityTitle,
  useRealtimeNotifications,
  type ActivityAction,
  type ActivityItem,
} from "@/hooks/use-realtime-notifications";

function timeAgo(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const ACTION_STYLE: Record<ActivityAction, { icon: typeof Plus; className: string }> = {
  added: { icon: Plus, className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  modified: { icon: Pencil, className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  deleted: { icon: Trash2, className: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

function Row({
  item,
  isNew,
  myUserId,
  nowMs,
}: {
  item: ActivityItem;
  isNew: boolean;
  myUserId: string | undefined;
  nowMs: number;
}) {
  const style = ACTION_STYLE[item.action] ?? ACTION_STYLE.modified;
  const Icon = style.icon;
  return (
    <li className={cn("flex gap-3 px-4 py-3", isNew && "bg-primary/5")}>
      <span
        className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", style.className)}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-5">{activityTitle(item, myUserId)}</p>
        {item.summary && (
          <p className="truncate text-sm leading-5 text-muted-foreground">{item.summary}</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(item.created_at, nowMs)}</p>
      </div>
      {isNew && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
    </li>
  );
}

/**
 * Bell icon pinned to the top-right corner (phone and laptop).
 * Shows who added / modified / deleted what, live, with a "ting".
 * Only the business admin and managers see it.
 */
export function NotificationCenter() {
  const { me, business } = useSession();
  const enabled = !!me && !!business && me.role !== "worker";

  const { items, unreadCount, markAllRead, soundOn, setSoundOn, lastSeen } = useRealtimeNotifications({
    businessId: enabled ? business?.id : null,
    userId: me?.userId,
  });

  const [open, setOpen] = useState(false);
  // What counted as "new" at the moment the list was opened (so the dots stay visible while reading).
  const [seenAtOpen, setSeenAtOpen] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [open]);

  if (!enabled) return null;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setSeenAtOpen(lastSeen);
      markAllRead();
    }
  };

  const myId = me?.userId;

  return (
    <div
      className={cn(
        "fixed right-3 top-3.5 z-50 md:right-5 md:top-2",
        "max-md:[@media(display-mode:standalone)]:top-[calc(0.875rem+env(safe-area-inset-top,0px))]",
      )}
    >
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} new` : "Notifications"}
            title="Notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-background">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="w-[min(92vw,380px)] overflow-hidden p-0"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSoundOn(!soundOn)}
                aria-pressed={soundOn}
                aria-label={soundOn ? "Mute notification sound" : "Turn on notification sound"}
                title={soundOn ? "Sound on" : "Sound off"}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={markAllRead}
                title="Mark all as read"
                aria-label="Mark all as read"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <CheckCheck className="h-4 w-4" />
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No activity yet. Adds, edits and deletes will show up here.
            </div>
          ) : (
            <ul className="max-h-[min(70vh,440px)] divide-y divide-border overflow-y-auto overscroll-contain">
              {items.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  nowMs={nowMs}
                  myUserId={myId}
                  isNew={!!seenAtOpen && item.created_at > seenAtOpen && item.actor_user_id !== myId}
                />
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}