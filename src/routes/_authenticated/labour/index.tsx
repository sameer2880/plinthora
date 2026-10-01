import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HardHat,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  UserCog,
  CalendarCheck,
  Sun,
  Check,
  X,
  Eraser,
  Upload,
} from "lucide-react";
import { LabourExportDialog } from "@/components/LabourExportDialog";
import { toast } from "sonner";
import { confirm } from "@/components/ui/confirm-dialog";
import type { UserRole } from "@/lib/auth/roles";
import { PLATFORM_NAME } from "@/lib/brand";
import { AdminOnly } from "@/components/AdminOnly";
import { isMasterAdmin } from "@/lib/auth/access";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/labour/")({
  head: () => ({
    meta: [
      { title: `Labour Charges — ${PLATFORM_NAME}` },
      { name: "description", content: "Day by day labour attendance and worker payment records." },
      { property: "og:title", content: `Labour Charges — ${PLATFORM_NAME}` },
      { property: "og:description", content: "Track worker attendance and daily payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LabourList,
});

export type Worker = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  username: string | null;
  must_set_password: boolean;
  daily_wage: number;
  active: boolean;
  notes: string | null;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/*  Attendance helpers (used by the "Mark Attendance" dialog)          */
/* ------------------------------------------------------------------ */

type AttStatus = "present" | "absent" | "holiday";
type DayType = "full" | "half" | "ot";
type AttRow = {
  id: string;
  worker_id: string;
  work_date: string;
  status: AttStatus;
  day_type: DayType;
};

/** A staged (not yet uploaded) mark for one worker on one date. `null` means "clear this mark". */
type DraftEntry = { status: AttStatus; day_type: DayType } | null;
type DraftMap = Record<string, Record<string, DraftEntry>>; // date -> workerId -> entry

const sameEntry = (a: DraftEntry, b: DraftEntry) => {
  if (!a || !b) return !a && !b;
  return a.status === b.status && (a.status !== "present" || a.day_type === b.day_type);
};

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dayStart = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Fetches every attendance row of one month (pages past the 1000-row API limit). */
async function fetchMonthAttendance(start: string, end: string): Promise<AttRow[]> {
  const PAGE = 1000;
  const rows: AttRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("worker_attendance")
      .select("id, worker_id, work_date, status, day_type")
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date")
      .order("worker_id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as AttRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/*  Mark Attendance dialog                                             */
/* ------------------------------------------------------------------ */

function MarkAttendanceDialog({
  workers,
  open,
  onOpenChange,
}: {
  workers: Worker[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const todayStr = ymd(new Date());
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = ymd(new Date(year, month, 1));
  const monthEnd = ymd(new Date(year, month + 1, 0));

  const { data: rows = [] } = useQuery({
    queryKey: ["all_attendance", monthStart],
    queryFn: () => fetchMonthAttendance(monthStart, monthEnd),
    enabled: open,
  });

  // date -> (workerId -> attendance row), only for the workers in this list
  const byDate = useMemo(() => {
    const ids = new Set(workers.map((w) => w.id));
    const m = new Map<string, Map<string, AttRow>>();
    rows.forEach((r) => {
      if (!ids.has(r.worker_id)) return;
      if (!m.has(r.work_date)) m.set(r.work_date, new Map());
      m.get(r.work_date)!.set(r.worker_id, r);
    });
    return m;
  }, [rows, workers]);

  // Changes are staged here and only written to the database by the Upload / Update button.
  const [draft, setDraft] = useState<DraftMap>({});
  const pendingCount = useMemo(
    () => Object.values(draft).reduce((n, day) => n + Object.keys(day).length, 0),
    [draft],
  );

  const savedOf = (date: string, workerId: string): DraftEntry => {
    const r = byDate.get(date)?.get(workerId);
    return r ? { status: r.status, day_type: r.day_type } : null;
  };

  /** What the screen should show: the staged value if there is one, otherwise what is saved. */
  const effective = (date: string, workerId: string): DraftEntry => {
    const d = draft[date];
    if (d && workerId in d) return d[workerId];
    return savedOf(date, workerId);
  };

  const stage = (updates: { worker_id: string; entry: DraftEntry }[]) => {
    setDraft((prev) => {
      const day = { ...(prev[selectedDate] ?? {}) };
      updates.forEach(({ worker_id, entry }) => {
        const normalized: DraftEntry = entry
          ? { status: entry.status, day_type: entry.status === "present" ? entry.day_type : "full" }
          : null;
        if (sameEntry(savedOf(selectedDate, worker_id), normalized)) delete day[worker_id];
        else day[worker_id] = normalized;
      });
      const next = { ...prev };
      if (Object.keys(day).length > 0) next[selectedDate] = day;
      else delete next[selectedDate];
      return next;
    });
  };

  const isHolidayForAll = (date: string) =>
    workers.length > 0 && workers.every((w) => effective(date, w.id)?.status === "holiday");

  const counts = (() => {
    let present = 0;
    let absent = 0;
    let holiday = 0;
    workers.forEach((w) => {
      const st = effective(selectedDate, w.id)?.status;
      if (st === "present") present++;
      else if (st === "absent") absent++;
      else if (st === "holiday") holiday++;
    });
    return { present, absent, holiday, unmarked: workers.length - present - absent - holiday };
  })();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["all_attendance"] });
    qc.invalidateQueries({ queryKey: ["worker_attendance"] }); // per-worker pages
  };

  const upload = useMutation({
    mutationFn: async () => {
      const upserts: {
        worker_id: string;
        work_date: string;
        status: AttStatus;
        present: boolean;
        day_type: DayType;
      }[] = [];
      const deletes: Record<string, string[]> = {};
      Object.entries(draft).forEach(([date, day]) => {
        Object.entries(day).forEach(([workerId, entry]) => {
          if (entry) {
            upserts.push({
              worker_id: workerId,
              work_date: date,
              status: entry.status,
              present: entry.status === "present",
              day_type: entry.status === "present" ? entry.day_type : "full",
            });
          } else {
            (deletes[date] ??= []).push(workerId);
          }
        });
      });
      if (upserts.length > 0) {
        const { error } = await supabase
          .from("worker_attendance")
          .upsert(upserts, { onConflict: "worker_id,work_date" });
        if (error) throw error;
      }
      for (const [date, ids] of Object.entries(deletes)) {
        const { error } = await supabase
          .from("worker_attendance")
          .delete()
          .eq("work_date", date)
          .in("worker_id", ids);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      const n = pendingCount;
      refresh();
      setDraft({});
      toast.success(`Attendance saved (${n} change${n === 1 ? "" : "s"})`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const holidayAll = isHolidayForAll(selectedDate);
  const busy = upload.isPending;
  const hasSavedForDate = workers.some((w) => savedOf(selectedDate, w.id));
  const uploadLabel = hasSavedForDate ? "Update" : "Upload";

  const handleOpenChange = async (v: boolean) => {
    if (!v && pendingCount > 0) {
      const discard = await confirm({
        description: "You have attendance changes that are not uploaded yet. Discard them?",
        confirmText: "Discard",
        variant: "destructive",
      });
      if (!discard) return;
    }
    if (!v) setDraft({});
    onOpenChange(v);
  };

  const toggleHoliday = () => {
    if (workers.length === 0) return;
    if (holidayAll) {
      stage(
        workers
          .filter((w) => effective(selectedDate, w.id)?.status === "holiday")
          .map((w) => ({ worker_id: w.id, entry: null })),
      );
      return;
    }
    stage(workers.map((w) => ({ worker_id: w.id, entry: { status: "holiday", day_type: "full" } })));
  };

  const markUnmarkedPresent = () => {
    const targets = workers.filter((w) => !effective(selectedDate, w.id));
    if (targets.length === 0) return toast.info("Everyone is already marked");
    stage(targets.map((w) => ({ worker_id: w.id, entry: { status: "present", day_type: "full" } })));
  };

  const clearAllAttendance = () => {
    const targets = workers.filter((w) => effective(selectedDate, w.id));
    if (targets.length === 0) return toast.info("Nothing to clear for this date");
    stage(targets.map((w) => ({ worker_id: w.id, entry: null })));
  };

  const changeMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setCursor(next);
    const now = new Date();
    const sameAsToday = next.getFullYear() === now.getFullYear() && next.getMonth() === now.getMonth();
    setSelectedDate(sameAsToday ? todayStr : ymd(next));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => void handleOpenChange(v)}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] max-w-4xl overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader className="border-b border-border pb-3 pr-8">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <CalendarCheck className="h-5 w-5 text-primary" /> Mark Attendance
          </DialogTitle>
          <DialogDescription>
            Pick a date, then mark every worker in one place. Holiday applies to all workers.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[minmax(0,330px)_minmax(0,1fr)] md:items-start">
          {/* ---------------- Calendar ---------------- */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">
                {cursor.toLocaleString("en-IN", { month: "long", year: "numeric" })}
              </h3>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => changeMonth(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Next month" onClick={() => changeMonth(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {WEEK_DAYS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} className="aspect-square rounded-lg bg-muted/20" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const date = ymd(new Date(year, month, i + 1));
                const holiday = isHolidayForAll(date);
                const marked = workers.some((w) => effective(date, w.id));
                const isSel = date === selectedDate;
                const isToday = date === todayStr;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    title={holiday ? "Holiday" : marked ? "Attendance marked" : "Not marked"}
                    className={cn(
                      "relative flex aspect-square items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold transition-all hover:bg-muted/60 active:scale-95",
                      holiday && "border-warning/40 bg-warning/20 text-warning font-bold hover:bg-warning/30",
                      isToday && !isSel && "border-primary/60 text-primary",
                      isSel && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    {i + 1}
                    {marked && !holiday && (
                      <Check
                        className={cn(
                          "absolute bottom-0.5 h-2.5 w-2.5",
                          isSel ? "text-primary-foreground" : "text-success",
                        )}
                        strokeWidth={3}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-warning/40 bg-warning/30" /> Holiday (all)
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3 w-3 text-success" strokeWidth={3} /> Marked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-primary bg-primary" /> Selected
              </span>
            </div>
          </div>

          {/* ---------------- Workers list ---------------- */}
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-base font-bold">
                  {dayStart(selectedDate).toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                <div className="text-xs text-muted-foreground">
                  Present {counts.present} · Absent {counts.absent} · Holiday {counts.holiday} · Not marked{" "}
                  {counts.unmarked}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={markUnmarkedPresent}
                  disabled={busy || workers.length === 0 || holidayAll}
                >
                  <Check className="h-4 w-4 mr-1.5" /> All present
                </Button>
                <Button
                  size="sm"
                  variant={holidayAll ? "default" : "outline"}
                  onClick={toggleHoliday}
                  disabled={busy || workers.length === 0}
                >
                  <Sun className="h-4 w-4 mr-1.5" />
                  {holidayAll ? "Remove holiday" : "Mark holiday (all)"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearAllAttendance}
                  disabled={busy || workers.length === 0 || counts.unmarked === workers.length}
                >
                  <Eraser className="h-4 w-4 mr-1.5" /> Clear attendance
                </Button>
                <Button
                  size="sm"
                  onClick={() => upload.mutate()}
                  disabled={busy || pendingCount === 0}
                >
                  <Upload className="h-4 w-4 mr-1.5" />
                  {upload.isPending ? "Uploading…" : uploadLabel}
                  {pendingCount > 0 && !upload.isPending ? ` (${pendingCount})` : ""}
                </Button>
              </div>
            </div>

            {workers.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No workers yet.</p>
            )}

            <div className="space-y-2 md:max-h-[58vh] md:overflow-y-auto md:pr-1">
              {workers.map((w) => {
                const rec = effective(selectedDate, w.id);
                const st = rec?.status;
                const dt = rec?.day_type ?? "full";
                const staged = !!draft[selectedDate] && w.id in draft[selectedDate];
                return (
                  <div
                    key={w.id}
                    className={cn(
                      "space-y-2 rounded-lg border border-border p-3",
                      st === "present" && "border-success/30 bg-success/[0.06]",
                      st === "absent" && "border-destructive/30 bg-destructive/[0.06]",
                      st === "holiday" && "border-warning/40 bg-warning/[0.10]",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{w.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {staged && <span className="mr-1 font-semibold text-warning">Not uploaded ·</span>}
                          {st === "holiday"
                            ? "Holiday"
                            : st === "present"
                              ? `Present · ${dt === "full" ? "Full day" : dt === "half" ? "Half day" : "Overtime (OT)"}`
                              : st === "absent"
                                ? "Absent"
                                : "Not marked"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant={st === "present" ? "default" : "outline"}
                          disabled={busy}
                          onClick={() =>
                            stage([
                              { worker_id: w.id, entry: { status: "present", day_type: st === "present" ? dt : "full" } },
                            ])
                          }
                        >
                          Present
                        </Button>
                        <Button
                          size="sm"
                          variant={st === "absent" ? "destructive" : "outline"}
                          disabled={busy}
                          onClick={() => stage([{ worker_id: w.id, entry: { status: "absent", day_type: "full" } }])}
                        >
                          Absent
                        </Button>
                        {rec && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            aria-label={`Clear ${w.name}`}
                            title="Clear mark"
                            disabled={busy}
                            onClick={() => stage([{ worker_id: w.id, entry: null }])}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {st === "present" && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {(["full", "half", "ot"] as DayType[]).map((d) => (
                          <Button
                            key={d}
                            size="sm"
                            variant={dt === d ? "default" : "outline"}
                            disabled={busy}
                            onClick={() => stage([{ worker_id: w.id, entry: { status: "present", day_type: d } }])}
                          >
                            {d === "full" ? "Full day" : d === "half" ? "Half day" : "OT"}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Labour Charges page                                                */
/* ------------------------------------------------------------------ */

function LabourList() {
  const [q, setQ] = useState("");
  const [markOpen, setMarkOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Labour Charges only ever shows "worker" role users of the current business.
  const { data: workers = [], isLoading } = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workers").select("*").eq("role", "worker").order("name");
      if (error) throw error;
      return data as Worker[];
    },
    enabled: isMasterAdmin(),
  });

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    if (!ql) return workers;
    return workers.filter((w) => w.name.toLowerCase().includes(ql) || (w.phone ?? "").includes(ql));
  }, [workers, q]);

  return (
    <AdminOnly label="Labour Charges">
    <div className="space-y-5">
      <LabourExportDialog open={exportOpen} onOpenChange={setExportOpen} workers={filtered} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <HardHat className="h-6 w-6 text-primary" /> Labour Charges
          </h2>
          <p className="text-sm text-muted-foreground">Workers list · open a worker for attendance and payments</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setMarkOpen(true)}>
            <CalendarCheck className="h-4 w-4 mr-1.5" /> Mark Attendance
          </Button>
          <Button variant="outline" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          <Button asChild>
            <Link to="/manage-worker">
              <UserCog className="h-4 w-4 mr-1.5" /> Manage Users
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search worker by name or mobile" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>

          {isLoading && <p className="text-center py-10 text-muted-foreground">Loading…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="text-center py-10 text-muted-foreground">
              No workers yet.{" "}
              <Link to="/manage-worker" className="text-primary underline underline-offset-2">
                Add your first worker
              </Link>
              .
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((w) => (
              <Link
                key={w.id}
                to="/labour/$id"
                params={{ id: w.id }}
                className="rounded-lg border border-border p-3 flex items-center gap-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{w.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {w.phone ? `${w.phone} · ` : ""}₹{Number(w.daily_wage).toLocaleString("en-IN")}/day
                    {!w.active && " · Login disabled"}
                  </div>
                  {w.notes && <div className="text-xs text-muted-foreground truncate mt-0.5">{w.notes}</div>}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <MarkAttendanceDialog workers={workers} open={markOpen} onOpenChange={setMarkOpen} />
    </div>
    </AdminOnly>
  );
}