import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { WorkerOverview } from "./labour/$id";
import { useSession } from "@/lib/auth/session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/worker")({
  // `/worker` = attendance & payments, `/worker?tab=feedback` = feedback.
  // A search param (instead of a second route) keeps the route tree unchanged.
  validateSearch: (search: Record<string, unknown>): { tab?: "feedback" } => ({
    tab: search.tab === "feedback" ? "feedback" : undefined,
  }),
  component: WorkerHome,
});

function WorkerHome() {
  // The worker's own row comes from their signed-in session (see lib/auth/session.tsx);
  // the database only ever lets them read their own attendance and payments.
  const { me } = useSession();
  const { tab } = Route.useSearch();
  if (!me?.workerId) {
    return <p className="text-center py-10 text-destructive">Worker account is not linked.</p>;
  }
  if (tab === "feedback") return <WorkerFeedback id={me.workerId} />;
  return <WorkerOverview id={me.workerId} readOnly />;
}

type FeedbackRow = {
  work_date: string;
  attendance_feedback: string | null;
  payment_feedback: string | null;
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const prettyDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/** Feedback tab for a worker: send feedback for any day and see what was already sent. */
function WorkerFeedback({ id }: { id: string }) {
  const qc = useQueryClient();
  const today = ymd(new Date());
  const [date, setDate] = useState(today);
  const [attendance, setAttendance] = useState("");
  const [payment, setPayment] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["worker_feedback", id, "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_feedback")
        .select("work_date, attendance_feedback, payment_feedback")
        .eq("worker_id", id)
        .order("work_date", { ascending: false });
      if (error) throw error;
      return data as FeedbackRow[];
    },
  });

  const load = (d: string, list: FeedbackRow[] = rows) => {
    const saved = list.find((r) => r.work_date === d);
    setAttendance(saved?.attendance_feedback ?? "");
    setPayment(saved?.payment_feedback ?? "");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!attendance.trim() && !payment.trim()) throw new Error("Write some feedback first");
      const { error } = await supabase.from("worker_feedback").upsert(
        {
          worker_id: id,
          work_date: date,
          attendance_feedback: attendance.trim() || null,
          payment_feedback: payment.trim() || null,
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

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div>
        <h2 className="text-fluid-3xl font-semibold tracking-tight">Feedback</h2>
        <p className="text-fluid-sm text-muted-foreground">
          Tell the owner about your attendance or payment for any day.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <Label htmlFor="fb-date">Date</Label>
          <Input
            id="fb-date"
            type="date"
            max={today}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (e.target.value) load(e.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="fb-att">Attendance feedback</Label>
          <Textarea
            id="fb-att"
            rows={3}
            value={attendance}
            onChange={(e) => setAttendance(e.target.value)}
            placeholder="Share feedback about your attendance record"
          />
        </div>
        <div>
          <Label htmlFor="fb-pay">Payment feedback</Label>
          <Textarea
            id="fb-pay"
            rows={3}
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            placeholder="Share feedback about the payment given"
          />
        </div>
        <Button
          className="w-full"
          onClick={() => save.mutate()}
          disabled={save.isPending || !date}
        >
          {save.isPending ? "Submitting…" : "Submit feedback"}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Your earlier feedback
        </p>

        {isLoading ? (
          <p className="px-1 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            <MessageSquareText className="h-6 w-6" />
            No feedback sent yet.
          </div>
        ) : (
          rows
            .filter((r) => r.attendance_feedback || r.payment_feedback)
            .map((r) => (
              <button
                key={r.work_date}
                type="button"
                onClick={() => {
                  setDate(r.work_date);
                  load(r.work_date);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="block w-full rounded-2xl border border-border bg-card p-3.5 text-left transition-colors hover:bg-muted/40"
              >
                <div className="text-sm font-semibold">{prettyDate(r.work_date)}</div>
                {r.attendance_feedback && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Attendance: </span>
                    {r.attendance_feedback}
                  </p>
                )}
                {r.payment_feedback && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Payment: </span>
                    {r.payment_feedback}
                  </p>
                )}
              </button>
            ))
        )}
      </div>
    </div>
  );
}