import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminOnly } from "@/components/AdminOnly";
import { isMasterAdmin } from "@/lib/auth/access";
import { LoadingBlock } from "@/components/LoadingScreen";

type Feedback = {
  id: string;
  worker_id: string;
  work_date: string;
  attendance_feedback: string | null;
  payment_feedback: string | null;
  created_at: string;
};

type Worker = { id: string; name: string };

export const Route = createFileRoute("/_authenticated/feedback")({
  component: FeedbackPage,
});

function FeedbackPage() {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: feedback = [], isLoading } = useQuery({
    queryKey: ["worker_feedback_admin"],
    queryFn: async () => {
      const [{ data: feedbackRows, error: feedbackError }, { data: workers, error: workersError }] =
        await Promise.all([
          supabase
            .from("worker_feedback")
            .select("id, worker_id, work_date, attendance_feedback, payment_feedback, created_at")
            .order("work_date", { ascending: false }),
          supabase.from("workers").select("id, name"),
        ]);
      if (feedbackError) throw feedbackError;
      if (workersError) throw workersError;
      const workerMap = new Map((workers as Worker[]).map((worker) => [worker.id, worker.name]));
      return (feedbackRows as Feedback[]).map((item) => ({
        ...item,
        workerName: workerMap.get(item.worker_id) ?? "Unknown worker",
      }));
    },
    enabled: isMasterAdmin(),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("worker_feedback")
        .delete()
        .not("id", "is", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker_feedback_admin"] });
      toast.success("Feedback cleared");
      setConfirmOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminOnly label="Worker Feedback">
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquare className="h-5 w-5 text-primary" /> Worker Feedback
          </h2>
          <p className="text-sm text-muted-foreground">
            Attendance and payment feedback submitted by workers.
          </p>
        </div>
        {feedback.length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Clear feedbacks
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingBlock title="Loading feedback…" />
      ) : feedback.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No worker feedback submitted yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {feedback.map((item) => (
            <Card key={item.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">{item.workerName}</div>
                  <time className="text-xs text-muted-foreground">
                    {new Date(`${item.work_date}T00:00:00`).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-muted/50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Attendance
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {item.attendance_feedback || "No feedback"}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Payment
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {item.payment_feedback || "No feedback"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every attendance and payment feedback entry submitted by
              workers. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearAll.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearAll.isPending}
              onClick={(e) => {
                e.preventDefault();
                clearAll.mutate();
              }}
            >
              {clearAll.isPending ? "Clearing…" : "Clear all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </AdminOnly>
  );
}