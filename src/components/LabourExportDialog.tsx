import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportLabourPdf, exportLabourXlsx, type DateRange, type LabourWorker } from "@/lib/labour-export";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Preset = { label: string; get: () => DateRange };

const PRESETS: Preset[] = [
  { label: "All dates", get: () => ({}) },
  {
    label: "This month",
    get: () => {
      const n = new Date();
      return { from: ymd(new Date(n.getFullYear(), n.getMonth(), 1)), to: ymd(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
    },
  },
  {
    label: "Last month",
    get: () => {
      const n = new Date();
      return { from: ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: ymd(new Date(n.getFullYear(), n.getMonth(), 0)) };
    },
  },
  {
    label: "Last 30 days",
    get: () => {
      const n = new Date();
      const s = new Date();
      s.setDate(n.getDate() - 29);
      return { from: ymd(s), to: ymd(n) };
    },
  },
];

export function LabourExportDialog({
  open,
  onOpenChange,
  workers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workers: LabourWorker[];
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);

  const invalid = Boolean(from && to && from > to);

  const run = async (kind: "xlsx" | "pdf") => {
    if (workers.length === 0) return toast.error("No workers to export");
    if (invalid) return toast.error("'From' date must be before 'To' date");
    setBusy(kind);
    try {
      const range: DateRange = { from: from || undefined, to: to || undefined };
      if (kind === "xlsx") await exportLabourXlsx(workers, range);
      else await exportLabourPdf(workers, range);
      toast.success(kind === "xlsx" ? "Excel downloaded" : "PDF downloaded");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" /> Export labour records
          </DialogTitle>
          <DialogDescription>
            {workers.length} worker{workers.length === 1 ? "" : "s"} · choose a date range, or leave both dates empty
            to export everything.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const r = p.get();
                  setFrom(r.from ?? "");
                  setTo(r.to ?? "");
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="labour-export-from">From</Label>
              <Input
                id="labour-export-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="labour-export-to">To</Label>
              <Input
                id="labour-export-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          {invalid && <p className="text-xs text-destructive">'From' date must be on or before 'To' date.</p>}
          <p className="text-xs text-muted-foreground">
            With a date range, earned / paid / balance are calculated for that period only.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={busy !== null || invalid} onClick={() => run("xlsx")}>
            {busy === "xlsx" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />}
            Excel
          </Button>
          <Button disabled={busy !== null || invalid} onClick={() => run("pdf")}>
            {busy === "pdf" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
            PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}