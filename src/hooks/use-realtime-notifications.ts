import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/* Activity notifications                                              */
/*                                                                     */
/* The database logs every add / edit / delete into `activity_log`     */
/* (see supabase/migrations/20260930000000_activity_notifications.sql).*/
/* This hook loads the latest entries, listens for new ones live, and  */
/* plays a short "ting" + shows a toast for each.                      */
/* ------------------------------------------------------------------ */

/** Set to true to also ting/toast for the signed-in user's own actions. */
const NOTIFY_OWN_ACTIONS = false;

const MAX_ITEMS = 40;
const SOUND_KEY = "mbs-notif-sound";

export type ActivityAction = "added" | "modified" | "deleted";

export interface ActivityItem {
  id: string;
  business_id: string;
  actor_user_id: string | null;
  actor_name: string;
  action: ActivityAction;
  entity: string;
  summary: string;
  created_at: string;
}

const ENTITY_LABEL: Record<string, string> = {
  rental: "a rental",
  diary: "a diary note",
  attendance: "attendance",
  payment: "a payment",
  feedback: "feedback",
};

export function activityTitle(a: ActivityItem, myUserId?: string | null): string {
  const who = myUserId && a.actor_user_id === myUserId ? "You" : a.actor_name;
  const what = ENTITY_LABEL[a.entity] ?? a.entity;
  return `${who} ${a.action} ${what}`;
}

/* ---------------------------- sound ------------------------------- */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

/** Browsers only allow audio after the first tap/click/keypress. Unlock it then. */
function useUnlockAudio() {
  useEffect(() => {
    const unlock = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") void ctx.resume();
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, unlock));
  }, []);
}

/** A short, bright two-tone bell "ting" (no audio file needed). */
export function playTing() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.35, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    master.connect(ctx.destination);

    const tone = (freq: number, start: number, peak: number, length: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);
      g.gain.setValueAtTime(0.0001, now + start);
      g.gain.exponentialRampToValueAtTime(peak, now + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
      osc.connect(g);
      g.connect(master);
      osc.start(now + start);
      osc.stop(now + start + length + 0.05);
    };

    tone(1318.5, 0, 0.9, 0.9); // E6
    tone(1975.5, 0.09, 0.7, 1.0); // B6
    tone(2637, 0.09, 0.15, 0.5); // shimmer
  } catch {
    // sound is a nicety; never break the app over it
  }
}

/* --------------------------- the hook ----------------------------- */

interface Options {
  businessId: string | null | undefined;
  userId: string | null | undefined;
}

type LooseClient = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => { limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
};

export function useRealtimeNotifications({ businessId, userId }: Options) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [soundOn, setSoundOnState] = useState(true);
  const [lastSeen, setLastSeen] = useState<string>("");
  const soundRef = useRef(true);
  const seenKey = userId ? `mbs-notif-seen:${userId}` : null;

  useUnlockAudio();

  // Saved preferences (sound on/off, when the list was last opened)
  useEffect(() => {
    try {
      const on = localStorage.getItem(SOUND_KEY) !== "off";
      setSoundOnState(on);
      soundRef.current = on;
      if (seenKey) {
        // First run: treat everything already in the log as read.
        setLastSeen(localStorage.getItem(seenKey) ?? new Date().toISOString());
      }
    } catch {
      /* storage unavailable */
    }
  }, [seenKey]);

  const setSoundOn = useCallback((on: boolean) => {
    setSoundOnState(on);
    soundRef.current = on;
    try {
      localStorage.setItem(SOUND_KEY, on ? "on" : "off");
    } catch {
      /* ignore */
    }
    if (on) playTing(); // preview
  }, []);

  const load = useCallback(async () => {
    if (!businessId) return;
    // `activity_log` is newer than the generated database types, so use a loose client.
    const client = supabase as unknown as LooseClient;
    const { data, error } = await client
      .from("activity_log")
      .select("id, business_id, actor_user_id, actor_name, action, entity, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_ITEMS);
    if (!error && Array.isArray(data)) setItems(data as ActivityItem[]);
  }, [businessId]);

  useEffect(() => {
    if (!businessId) {
      setItems([]);
      return;
    }
    void load();

    const channel = supabase
      .channel(`activity-${businessId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log", filter: `business_id=eq.${businessId}` },
        (payload) => {
          const row = payload.new as ActivityItem;
          setItems((prev) =>
            prev.some((p) => p.id === row.id) ? prev : [row, ...prev].slice(0, MAX_ITEMS),
          );

          const mine = !!userId && row.actor_user_id === userId;
          if (mine && !NOTIFY_OWN_ACTIONS) return;

          if (soundRef.current) playTing();
          try {
            if ("vibrate" in navigator) navigator.vibrate?.(120);
          } catch {
            /* ignore */
          }
          toast(activityTitle(row, userId), {
            description: row.summary || undefined,
            duration: 5000,
          });
        },
      )
      .subscribe();

    // Catch up on anything missed while the tab was in the background.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [businessId, userId, load]);

  const unreadCount = useMemo(
    () =>
      items.filter(
        (i) =>
          i.created_at > lastSeen && (NOTIFY_OWN_ACTIONS || !userId || i.actor_user_id !== userId),
      ).length,
    [items, lastSeen, userId],
  );

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setLastSeen(now);
    if (seenKey) {
      try {
        localStorage.setItem(seenKey, now);
      } catch {
        /* ignore */
      }
    }
  }, [seenKey]);

  return { items, unreadCount, markAllRead, soundOn, setSoundOn, lastSeen };
}