import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { confirm } from "@/components/ui/confirm-dialog";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { LabourExportDialog } from "@/components/LabourExportDialog";
import { AdminOnly } from "@/components/AdminOnly";
import type { Worker } from "./index";
import { PLATFORM_NAME } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/labour/$id")({
  head: () => ({
    meta: [
      { title: `Worker Attendance & Payments — ${PLATFORM_NAME}` },
      {
        name: "description",
        content:
          "Day by day attendance calendar and payment history for a worker.",
      },
      { property: "og:title", content: `Worker Attendance & Payments — ${PLATFORM_NAME}` },
      {
        property: "og:description",
        content: "Attendance calendar and payment history for a worker.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LabourWorkerRoute,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-4">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-4">Worker not found.</div>,
});

function LabourWorkerRoute() {
  const { id } = Route.useParams();
  return (
    <AdminOnly label="Labour Charges">
      <WorkerOverview id={id} />
    </AdminOnly>
  );
}

type AttStatus = "present" | "absent" | "holiday";
type DayType = "full" | "half" | "ot";
type Attendance = {
  id: string;
  work_date: string;
  present: boolean;
  status: AttStatus;
  day_type: DayType;
  note: string | null;
};
type Payment = { id: string; amount: number; note: string | null; paid_at: string };
/** A payment change that is staged in the day window and only saved by Upload / Update. */
type StagedPayment = { key: string; id?: string; amount: number; note: string | null; paid_at: string };
type Feedback = {
  work_date: string;
  attendance_feedback: string | null;
  payment_feedback: string | null;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function localDateTimeValue(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function dayStart(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const STATUS_LABEL: Record<AttStatus, string> = {
  present: "Present",
  absent: "Absent",
  holiday: "Holiday",
};
const DAY_TYPE_LABEL: Record<DayType, string> = {
  full: "Full day",
  half: "Half day",
  ot: "Overtime (OT)",
};
const DAY_TYPE_SHORT: Record<DayType, string> = { full: "", half: "½", ot: "OT" };
const DAY_TYPE_FACTOR: Record<DayType, number> = { full: 1, half: 0.5, ot: 0.25 };

export function WorkerOverview({ id, readOnly = false }: { id: string; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(() => new Date());
  const [exportOpen, setExportOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(ymd(new Date()));
  const [dayNote, setDayNote] = useState("");
  const [attendanceFeedback, setAttendanceFeedback] = useState("");
  const [paymentFeedback, setPaymentFeedback] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Staged (not yet uploaded) changes made inside the day window
  const [draftAtt, setDraftAtt] = useState<{ status: AttStatus | null; dayType: DayType } | null>(null);
  const [pendingAdds, setPendingAdds] = useState<StagedPayment[]>([]);
  const [pendingEdits, setPendingEdits] = useState<Record<string, StagedPayment>>({});
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const [payStage, setPayStage] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editingPay, setEditingPay] = useState<Payment | null>(null);
  const [payForm, setPayForm] = useState({
    amount: "",
    note: "",
    paid_at: localDateTimeValue(new Date()),
  });

  const { data: worker } = useQuery({
    queryKey: ["worker", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("workers").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Worker;
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["worker_attendance", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_attendance")
        .select("*")
        .eq("worker_id", id);
      if (error) throw error;
      return data as unknown as Attendance[];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["worker_payments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_payments")
        .select("*")
        .eq("worker_id", id)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });

  const { data: feedback = [] } = useQuery({
    queryKey: ["worker_feedback", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_feedback")
        .select("work_date, attendance_feedback, payment_feedback")
        .eq("worker_id", id);
      if (error) throw error;
      return data as Feedback[];
    },
  });

  const attMap = useMemo(() => {
    const m = new Map<string, Attendance>();
    attendance.forEach((a) => m.set(a.work_date, a));
    return m;
  }, [attendance]);

  const savePayment = useMutation({
    mutationFn: async () => {
      const amount = Number(payForm.amount);
      if (!amount) throw new Error("Enter an amount");
      const row = {
        worker_id: id,
        amount,
        note: payForm.note.trim() || null,
        paid_at: new Date(payForm.paid_at).toISOString(),
      };
      if (editingPay) {
        const { error } = await supabase
          .from("worker_payments")
          .update(row)
          .eq("id", editingPay.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("worker_payments").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker_payments", id] });
      toast.success(editingPay ? "Payment updated" : "Payment recorded");
      setPayOpen(false);
      setEditingPay(null);
      setPayForm({ amount: "", note: "", paid_at: localDateTimeValue(new Date()) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delPayment = useMutation({
    mutationFn: async (pid: string) => {
      const { error } = await supabase.from("worker_payments").delete().eq("id", pid);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker_payments", id] });
      toast.success("Payment removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFeedback = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("worker_feedback").upsert(
        {
          worker_id: id,
          work_date: selectedDate,
          attendance_feedback: attendanceFeedback.trim() || null,
          payment_feedback: paymentFeedback.trim() || null,
        },
        { onConflict: "worker_id,work_date" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker_feedback", id] });
      toast.success("Feedback submitted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = ymd(new Date());

  const monthKeys = Array.from({ length: daysInMonth }, (_, i) =>
    ymd(new Date(year, month, i + 1)),
  );
  const statusOf = (k: string) => attMap.get(k)?.status;
  const presentDays = monthKeys.filter((k) => statusOf(k) === "present").length;
  const absentDays = monthKeys.filter((k) => statusOf(k) === "absent").length;
  const holidayDays = monthKeys.filter((k) => statusOf(k) === "holiday").length;
  const halfDays = monthKeys.filter(
    (k) => statusOf(k) === "present" && attMap.get(k)?.day_type === "half",
  ).length;
  const otDays = monthKeys.filter(
    (k) => statusOf(k) === "present" && attMap.get(k)?.day_type === "ot",
  ).length;
  const workUnits = monthKeys.reduce(
    (s, k) =>
      statusOf(k) === "present" ? s + DAY_TYPE_FACTOR[attMap.get(k)?.day_type ?? "full"] : s,
    0,
  );

  const monthPayments = payments.filter((p) => {
    const d = new Date(p.paid_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const monthPaid = monthPayments.reduce((s, p) => s + Number(p.amount), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const earned = workUnits * Number(worker?.daily_wage ?? 0);

  const dayPayments = payments.filter((p) => ymd(new Date(p.paid_at)) === selectedDate);
  const dayAtt = attMap.get(selectedDate);

  // --- staged view of the selected day -------------------------------------------------
  const effStatus: AttStatus | null = draftAtt ? draftAtt.status : (dayAtt?.status ?? null);
  const effDayType: DayType = draftAtt ? draftAtt.dayType : (dayAtt?.day_type ?? "full");
  const effNote = effStatus ? dayNote.trim() || null : null;
  const attDirty =
    effStatus !== (dayAtt?.status ?? null) ||
    (effStatus === "present" && effDayType !== (dayAtt?.day_type ?? "full")) ||
    (effStatus !== null && effNote !== (dayAtt?.note ?? null));

  const dayPaymentsView: StagedPayment[] = [
    ...dayPayments
      .filter((p) => !pendingDeletes.includes(p.id))
      .map(
        (p): StagedPayment =>
          pendingEdits[p.id] ?? { key: p.id, id: p.id, amount: Number(p.amount), note: p.note, paid_at: p.paid_at },
      ),
    ...pendingAdds,
  ];
  const dayPaymentViewTotal = dayPaymentsView.reduce((sum, p) => sum + Number(p.amount), 0);
  const payDirty = pendingAdds.length > 0 || Object.keys(pendingEdits).length > 0 || pendingDeletes.length > 0;
  const dirty = attDirty || payDirty;
  const hasSavedForDay = !!dayAtt || dayPayments.length > 0;
  const uploadLabel = hasSavedForDay ? "Update" : "Upload";

  const resetDrafts = () => {
    setDraftAtt(null);
    setPendingAdds([]);
    setPendingEdits({});
    setPendingDeletes([]);
  };

  const uploadDay = useMutation({
    mutationFn: async () => {
      const date = selectedDate;
      if (attDirty) {
        const existing = attMap.get(date);
        if (effStatus === null) {
          if (existing) {
            const { error } = await supabase.from("worker_attendance").delete().eq("id", existing.id);
            if (error) throw error;
          }
        } else {
          const row = {
            worker_id: id,
            work_date: date,
            status: effStatus,
            present: effStatus === "present",
            day_type: effStatus === "present" ? effDayType : "full",
            note: effNote,
          };
          if (existing) {
            const { error } = await supabase.from("worker_attendance").update(row).eq("id", existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("worker_attendance").insert(row);
            if (error) throw error;
          }
        }
      }
      if (pendingDeletes.length > 0) {
        const { error } = await supabase.from("worker_payments").delete().in("id", pendingDeletes);
        if (error) throw error;
      }
      for (const e of Object.values(pendingEdits)) {
        const { error } = await supabase
          .from("worker_payments")
          .update({ amount: e.amount, note: e.note, paid_at: e.paid_at })
          .eq("id", e.id!);
        if (error) throw error;
      }
      if (pendingAdds.length > 0) {
        const { error } = await supabase.from("worker_payments").insert(
          pendingAdds.map((a) => ({ worker_id: id, amount: a.amount, note: a.note, paid_at: a.paid_at })),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker_attendance", id] });
      qc.invalidateQueries({ queryKey: ["all_attendance"] });
      qc.invalidateQueries({ queryKey: ["worker_payments", id] });
      toast.success(hasSavedForDay ? "Updated" : "Uploaded");
      resetDrafts();
      setDayOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestCloseDay = async () => {
    if (dirty) {
      const discard = await confirm({
        description: "You have changes that are not uploaded yet. Discard them?",
        confirmText: "Discard",
        variant: "destructive",
      });
      if (!discard) return;
    }
    resetDrafts();
    setDayOpen(false);
  };

  const stagePayment = () => {
    const amount = Number(payForm.amount);
    if (!amount) return toast.error("Enter an amount");
    const base = {
      amount,
      note: payForm.note.trim() || null,
      paid_at: new Date(payForm.paid_at).toISOString(),
    };
    if (editingPay) {
      const isNew = pendingAdds.some((a) => a.key === editingPay.id);
      if (isNew) {
        setPendingAdds((list) => list.map((a) => (a.key === editingPay.id ? { ...a, ...base } : a)));
      } else {
        setPendingEdits((m) => ({ ...m, [editingPay.id]: { key: editingPay.id, id: editingPay.id, ...base } }));
      }
    } else {
      setPendingAdds((list) => [...list, { key: `new-${Date.now()}-${list.length}`, ...base }]);
    }
    setPayOpen(false);
    setEditingPay(null);
    setPayForm({ amount: "", note: "", paid_at: localDateTimeValue(new Date()) });
  };

  const stageDeletePayment = (p: StagedPayment) => {
    if (!p.id) {
      setPendingAdds((list) => list.filter((a) => a.key !== p.key));
      return;
    }
    setPendingEdits((m) => {
      const { [p.id!]: _removed, ...rest } = m;
      return rest;
    });
    setPendingDeletes((list) => [...list, p.id!]);
  };

  const openDay = (date: string) => {
    resetDrafts();
    setSelectedDate(date);
    setDayNote(attMap.get(date)?.note ?? "");
    const savedFeedback = feedback.find((item) => item.work_date === date);
    setAttendanceFeedback(savedFeedback?.attendance_feedback ?? "");
    setPaymentFeedback(savedFeedback?.payment_feedback ?? "");
    setFeedbackOpen(Boolean(savedFeedback?.attendance_feedback || savedFeedback?.payment_feedback));
    setDayOpen(true);
  };

  const openPayment = (p: Payment | null, dateStr?: string, stageIt = false) => {
    setPayStage(stageIt);
    setEditingPay(p);
    setPayForm(
      p
        ? {
            amount: String(p.amount),
            note: p.note ?? "",
            paid_at: localDateTimeValue(new Date(p.paid_at)),
          }
        : {
            amount: "",
            note: "",
            paid_at: localDateTimeValue(
              dateStr ? new Date(dayStart(dateStr).setHours(10, 0, 0, 0)) : new Date(),
            ),
          },
    );
    setPayOpen(true);
  };

  return (
    <div className="space-y-5">
      {!readOnly && worker && (
        <LabourExportDialog open={exportOpen} onOpenChange={setExportOpen} workers={[worker]} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && (
          <Button variant="ghost" size="icon" asChild>
            <Link to="/labour">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold sm:text-2xl">{worker?.name ?? "Worker"}</h2>
          <p className="text-sm text-muted-foreground">
            {worker?.phone ? `${worker.phone} · ` : ""}₹
            {Number(worker?.daily_wage ?? 0).toLocaleString("en-IN")}/day
          </p>
        </div>
        {!readOnly && (
          <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] lg:items-start">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:self-start">
          {[
            { label: "Present this month", value: `${presentDays} days`, tone: "text-success" },
            {
              label: "Absent / Holiday",
              value: `${absentDays} / ${holidayDays} days`,
              tone: "text-destructive",
            },
            {
              label: "Wage earned (month)",
              value: `₹${earned.toLocaleString("en-IN")}`,
              tone: "text-primary",
            },
            {
              label: "Paid (month / total)",
              value: `₹${monthPaid.toLocaleString("en-IN")} / ₹${totalPaid.toLocaleString("en-IN")}`,
              tone: "text-primary",
            },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className={cn("text-lg font-bold", s.tone)}>{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="overflow-y-auto lg:h-[calc(100vh-9rem)] lg:min-h-[420px] lg:max-h-[640px]">
          <CardContent className="space-y-4 p-4 lg:p-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Attendance calendar
                </p>
                <h3 className="mt-1 text-lg font-bold text-foreground">
                  {cursor.toLocaleString("en-IN", { month: "long", year: "numeric" })}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous month"
                  onClick={() => setCursor(new Date(year, month - 1, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next month"
                  onClick={() => setCursor(new Date(year, month + 1, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mx-auto w-full max-w-5xl lg:max-w-none">
              <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:gap-2 sm:text-xs sm:tracking-wider">
                {DAYS.map((d) => (
                  <div key={d} className="pb-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`e${i}`} className="aspect-square min-w-0 rounded-[32%] bg-muted/20" />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const date = ymd(new Date(year, month, i + 1));
                  const st = statusOf(date);
                  const dt = attMap.get(date)?.day_type ?? "full";
                  const isToday = date === todayStr;
                  const hasPay = payments.some((p) => ymd(new Date(p.paid_at)) === date);
                  return (
                    <button
                      key={date}
                      onClick={() => openDay(date)}
                      title={
                        st
                          ? `${STATUS_LABEL[st]}${st === "present" ? ` · ${DAY_TYPE_LABEL[dt]}` : ""}`
                          : "No record — tap to set"
                      }
                      className={cn(
                        "relative flex aspect-square min-w-0 flex-col items-center justify-center rounded-[32%] border border-border bg-card text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-95",
                        !st && "text-muted-foreground hover:border-primary/40 hover:bg-muted/50",
                        st === "present" &&
                          "border-success/30 bg-success/10 text-success hover:bg-success/20",
                        st === "absent" &&
                          "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
                        st === "holiday" &&
                          "border-warning/40 bg-warning/20 text-warning font-bold hover:bg-warning/30",
                        isToday &&
                          !st &&
                          "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                        isToday && st && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                      )}
                    >
                      <span>{i + 1}</span>
                      {st === "present" && DAY_TYPE_SHORT[dt] && (
                        <span className="absolute right-1.5 top-1 text-[8px] font-bold leading-none text-primary sm:right-2 sm:top-1.5 sm:text-[9px]">
                          {DAY_TYPE_SHORT[dt]}
                        </span>
                      )}
                      {hasPay && (
                        <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-primary sm:bottom-1.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-md border border-success/30 bg-success/20" />{" "}
                Present
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-md border border-destructive/30 bg-destructive/20" />{" "}
                Absent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-md border border-warning/40 bg-warning/30" /> Holiday
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Payment on that day
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:h-[calc(100vh-9rem)] lg:min-h-[420px] lg:max-h-[640px] lg:overflow-y-auto">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> Money given
              </h3>
            </div>

            {payments.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No payments recorded yet.
              </p>
            )}
            <div className="divide-y divide-border">
              {payments.map((p) => (
                <div key={p.id} className="flex items-start gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-primary">
                      ₹{Number(p.amount).toLocaleString("en-IN")}
                    </div>
                    {p.note && (
                      <div className="text-sm text-muted-foreground break-words">{p.note}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(p.paid_at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                  </div>
                  {!readOnly && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openPayment(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmDelete
                        onConfirm={() => delPayment.mutate(p.id)}
                        title="Delete this payment?"
                        description="This payment record will be permanently removed."
                        restricted
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dayOpen} onOpenChange={(o) => (o ? setDayOpen(true) : void requestCloseDay())}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-2xl border-border/80 p-4 shadow-2xl sm:p-6">
          <DialogHeader className="border-b border-border pb-4 pr-8">
            <DialogTitle className="text-lg font-bold sm:text-xl">
              {dayStart(selectedDate).toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-primary/15 bg-primary/[0.06] p-3.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Attendance
                </div>
                <div className="mt-1 font-semibold text-foreground">
                  {effStatus
                    ? `${STATUS_LABEL[effStatus]}${effStatus === "present" ? ` · ${DAY_TYPE_LABEL[effDayType]}` : ""}`
                    : "Not marked"}
                </div>
              </div>
              <div className="rounded-xl border border-success/20 bg-success/[0.06] p-3.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Amount given
                </div>
                <div className="mt-1 font-semibold text-primary">
                  ₹{dayPaymentViewTotal.toLocaleString("en-IN")}
                </div>
              </div>
            </div>

            {!readOnly && (
              <>
                <div className="space-y-2">
                  <Label>Attendance</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["present", "absent", "holiday"] as AttStatus[]).map((s) => (
                      <Button
                        key={s}
                        variant={effStatus === s ? "default" : "outline"}
                        onClick={() =>
                          setDraftAtt({ status: s, dayType: s === "present" ? effDayType : "full" })
                        }
                        disabled={uploadDay.isPending}
                      >
                        {STATUS_LABEL[s]}
                      </Button>
                    ))}
                  </div>

                  {effStatus === "present" && (
                    <div className="space-y-2 pt-1">
                      <Label className="text-xs text-muted-foreground">How long did he work?</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["full", "half", "ot"] as DayType[]).map((d) => (
                          <Button
                            key={d}
                            size="sm"
                            variant={effDayType === d ? "default" : "outline"}
                            onClick={() => setDraftAtt({ status: "present", dayType: d })}
                            disabled={uploadDay.isPending}
                          >
                            {d === "ot" ? "OT" : d === "half" ? "Half day" : "Full day"}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <ConfirmDelete
                    onConfirm={() => {
                      setDraftAtt({ status: null, dayType: "full" });
                      setDayNote("");
                    }}
                    title="Clear attendance for this day?"
                    description="The attendance mark and its note will be removed when you press Update. Payments are not affected."
                    confirmLabel="Clear"
                    restricted
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive w-full"
                      disabled={!effStatus}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" /> Clear attendance
                    </Button>
                  </ConfirmDelete>
                </div>

                <div>
                  <Label>Day note</Label>
                  <Textarea
                    rows={2}
                    value={dayNote}
                    onChange={(e) => setDayNote(e.target.value)}
                    placeholder="Optional note for this day"
                  />
                </div>
              </>
            )}

            <div className="space-y-3 rounded-xl border border-border bg-card p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-semibold">Payments on this day</Label>
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openPayment(null, selectedDate, true)}
                  >
                    <Plus className="h-4 w-4 mr-1.5" /> Add
                  </Button>
                )}
              </div>
              {dayPaymentsView.length === 0 && (
                <p className="rounded-lg bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
                  No payments on this day.
                </p>
              )}
              <div className="space-y-2">
                {dayPaymentsView.map((p) => {
                  const unsaved = !p.id || !!pendingEdits[p.id];
                  return (
                    <div
                      key={p.key}
                      className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-primary sm:text-lg">
                          ₹{Number(p.amount).toLocaleString("en-IN")}
                        </div>
                        {p.note && (
                          <div className="text-sm text-muted-foreground break-words">{p.note}</div>
                        )}
                        <div className="text-[11px] text-muted-foreground">
                          {unsaved && <span className="mr-1 font-semibold text-warning">Not uploaded ·</span>}
                          {new Date(p.paid_at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      {!readOnly && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              openPayment(
                                { id: p.id ?? p.key, amount: p.amount, note: p.note, paid_at: p.paid_at },
                                undefined,
                                true,
                              )
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <ConfirmDelete
                            onConfirm={() => stageDeletePayment(p)}
                            title="Remove this payment?"
                            description="It will be removed when you press Update."
                            restricted
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {readOnly && (
              <div className="rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
                {!feedbackOpen ? (
                  <Button
                    variant="outline"
                    className="w-full justify-center bg-background sm:w-auto"
                    onClick={() => setFeedbackOpen(true)}
                  >
                    Give feedback
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="attendance-feedback">Attendance feedback</Label>
                      <Textarea
                        id="attendance-feedback"
                        rows={3}
                        value={attendanceFeedback}
                        onChange={(e) => setAttendanceFeedback(e.target.value)}
                        placeholder="Share feedback about your attendance record"
                      />
                    </div>
                    <div>
                      <Label htmlFor="payment-feedback">Payment feedback</Label>
                      <Textarea
                        id="payment-feedback"
                        rows={3}
                        value={paymentFeedback}
                        onChange={(e) => setPaymentFeedback(e.target.value)}
                        placeholder="Share feedback about the payment given"
                      />
                    </div>
                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => saveFeedback.mutate()}
                      disabled={saveFeedback.isPending}
                    >
                      {saveFeedback.isPending ? "Submitting…" : "Submit feedback"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border pt-4 sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => void requestCloseDay()}
            >
              Close
            </Button>
            {!readOnly && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => uploadDay.mutate()}
                disabled={!dirty || uploadDay.isPending}
              >
                <Upload className="h-4 w-4 mr-1.5" />
                {uploadDay.isPending ? "Uploading…" : uploadLabel}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment form */}
      {!readOnly && (
        <Dialog
          open={payOpen}
          onOpenChange={(o) => {
            setPayOpen(o);
            if (!o) setEditingPay(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPay ? "Edit payment" : "Add payment"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                />
              </div>
              <div>
                <Label>Date &amp; time</Label>
                <Input
                  type="datetime-local"
                  value={payForm.paid_at}
                  onChange={(e) => setPayForm({ ...payForm, paid_at: e.target.value })}
                />
              </div>
              <div>
                <Label>Note</Label>
                <Textarea
                  rows={2}
                  value={payForm.note}
                  onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
                  placeholder="Advance, weekly wage, etc."
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {payStage
                  ? "Press Upload / Update in the day window to save this payment."
                  : "Payments do not change attendance — set attendance from the calendar day."}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => (payStage ? stagePayment() : savePayment.mutate())}
                disabled={!payStage && savePayment.isPending}
              >
                {payStage ? "Done" : savePayment.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}