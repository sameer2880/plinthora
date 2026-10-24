import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, HardHat, Boxes, Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listRentals, groupRentals, todayLocal, type RentalGroup } from "@/lib/rentals";
import { exportRentalsCsv, exportRentalsPdf, printRentals } from "@/lib/rentals-export";
import { exportLabourPdf, exportLabourXlsx, type DateRange, type LabourWorker } from "@/lib/labour-export";
import { isMasterAdmin } from "@/lib/auth/access";
import { isFeatureEnabled } from "@/lib/features";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/export")({
  component: ExportPage,
});

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const PRESETS: { label: string; get: () => DateRange }[] = [
  { label: "All dates", get: () => ({}) },
  { label: "Today", get: () => ({ from: todayLocal(), to: todayLocal() }) },
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

const selectClass = "w-full h-10 rounded-md border border-input bg-background px-3 text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function DateFilters({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
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
        <Field label="From">
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rentals export                                                      */
/* ------------------------------------------------------------------ */

function RentalsExport() {
  const { data: rentals = [], isLoading } = useQuery({ queryKey: ["rentals"], queryFn: listRentals });
  const groups = useMemo(() => groupRentals(rentals), [rentals]);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dateField, setDateField] = useState<"issue_date" | "return_date">("issue_date");
  const [status, setStatus] = useState<"all" | RentalGroup["status"]>("all");
  const [payment, setPayment] = useState<"all" | RentalGroup["payment_status"]>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"csv" | "pdf" | "print" | null>(null);

  const invalid = !!from && !!to && from > to;

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return groups.filter((g) => {
      const d = g[dateField];
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;
      if (status !== "all" && g.status !== status) return false;
      if (payment !== "all" && g.payment_status !== payment) return false;
      if (!ql) return true;
      return (
        g.customer_name.toLowerCase().includes(ql) ||
        g.customer_phone.includes(ql) ||
        g.rows.some((r) => r.material_name.toLowerCase().includes(ql))
      );
    });
  }, [groups, from, to, dateField, status, payment, q]);

  const note =
    [
      status !== "all" && `Status: ${status}`,
      payment !== "all" && `Payment: ${payment}`,
      q.trim() && `Search: "${q.trim()}"`,
      from && to && `${dateField === "issue_date" ? "Issue" : "Return"} date: ${from} to ${to}`,
      from && !to && `${dateField === "issue_date" ? "Issue" : "Return"} date from: ${from}`,
      !from && to && `${dateField === "issue_date" ? "Issue" : "Return"} date up to: ${to}`,
    ]
      .filter(Boolean)
      .join(", ") || undefined;

  const run = async (kind: "csv" | "pdf" | "print") => {
    if (invalid) return toast.error("'From' date must be on or before 'To' date");
    if (rows.length === 0) return toast.error("No rentals match these filters");
    setBusy(kind);
    try {
      if (kind === "csv") exportRentalsCsv(rows);
      else if (kind === "pdf") await exportRentalsPdf(rows, note);
      else printRentals(rows, note);
      if (kind !== "print") toast.success(kind === "csv" ? "CSV downloaded" : "PDF downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setFrom("");
    setTo("");
    setDateField("issue_date");
    setStatus("all");
    setPayment("all");
    setQ("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="h-5 w-5 text-primary" /> Export rentals data
        </CardTitle>
        <CardDescription>Pick the filters, then download as CSV / PDF or print.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Filter dates by">
            <select className={selectClass} value={dateField} onChange={(e) => setDateField(e.target.value as typeof dateField)}>
              <option value="issue_date">Issue date</option>
              <option value="return_date">Return date</option>
            </select>
          </Field>
          <Field label="Customer / material / mobile">
            <Input placeholder="Search (optional)" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
        </div>

        <DateFilters from={from} to={to} setFrom={setFrom} setTo={setTo} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partially returned</option>
              <option value="returned">Returned</option>
            </select>
          </Field>
          <Field label="Payment">
            <select className={selectClass} value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)}>
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Not paid</option>
            </select>
          </Field>
        </div>

        <p className={`text-sm ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
          {invalid
            ? "'From' date must be on or before 'To' date."
            : isLoading
              ? "Loading rentals…"
              : `${rows.length} rental${rows.length === 1 ? "" : "s"} will be included.`}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!busy || invalid || isLoading} onClick={() => run("csv")}>
            {busy === "csv" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />}
            CSV
          </Button>
          <Button disabled={!!busy || invalid || isLoading} onClick={() => run("pdf")}>
            {busy === "pdf" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
            PDF
          </Button>
          <Button variant="outline" disabled={!!busy || invalid || isLoading} onClick={() => run("print")}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={reset}>
            Reset filters
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Attendance export                                                   */
/* ------------------------------------------------------------------ */

function AttendanceExport() {
  const { data: workers = [], isLoading } = useQuery({
    queryKey: ["workers", "labour"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workers").select("*").eq("role", "worker").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as LabourWorker[];
    },
  });

  const [workerId, setWorkerId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);

  const invalid = !!from && !!to && from > to;
  const selected = workerId === "all" ? workers : workers.filter((w) => w.id === workerId);

  const run = async (kind: "xlsx" | "pdf") => {
    if (invalid) return toast.error("'From' date must be on or before 'To' date");
    if (selected.length === 0) return toast.error("No workers to export");
    setBusy(kind);
    try {
      const range: DateRange = { from: from || undefined, to: to || undefined };
      if (kind === "xlsx") await exportLabourXlsx(selected, range);
      else await exportLabourPdf(selected, range);
      toast.success(kind === "xlsx" ? "Excel downloaded" : "PDF downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setWorkerId("all");
    setFrom("");
    setTo("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-5 w-5 text-primary" /> Export attendance data
        </CardTitle>
        <CardDescription>
          Attendance and payments, date by date. With a date range, earned / paid / balance are for that period only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field label="Worker">
          <select className={selectClass} value={workerId} onChange={(e) => setWorkerId(e.target.value)} disabled={isLoading}>
            <option value="all">All workers ({workers.length})</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.phone ? ` · ${w.phone}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <DateFilters from={from} to={to} setFrom={setFrom} setTo={setTo} />

        <p className={`text-sm ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
          {invalid
            ? "'From' date must be on or before 'To' date."
            : isLoading
              ? "Loading workers…"
              : `${selected.length} worker${selected.length === 1 ? "" : "s"} will be included.`}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!busy || invalid || isLoading} onClick={() => run("xlsx")}>
            {busy === "xlsx" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />}
            Excel
          </Button>
          <Button disabled={!!busy || invalid || isLoading} onClick={() => run("pdf")}>
            {busy === "pdf" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
            PDF
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={reset}>
            Reset filters
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function ExportPage() {
  const { business } = useSession();
  const canRentals = isFeatureEnabled(business, "rentals");
  const canAttendance = isFeatureEnabled(business, "labour") && isMasterAdmin();

  const first = canRentals ? "rentals" : "attendance";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Download className="h-6 w-6 text-primary" /> Export Data
        </h2>
        <p className="text-sm text-muted-foreground">Choose what to export, set your filters and download.</p>
      </div>

      {!canRentals && !canAttendance ? (
        <p className="py-10 text-center text-muted-foreground">There is nothing to export for this account.</p>
      ) : (
        <Tabs defaultValue={first}>
          <TabsList>
            {canRentals && <TabsTrigger value="rentals">Rentals data</TabsTrigger>}
            {canAttendance && <TabsTrigger value="attendance">Attendance data</TabsTrigger>}
          </TabsList>
          {canRentals && (
            <TabsContent value="rentals">
              <RentalsExport />
            </TabsContent>
          )}
          {canAttendance && (
            <TabsContent value="attendance">
              <AttendanceExport />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}