import { useState, type HTMLAttributes } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listRentals, type Rental } from "@/lib/rentals";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { useDeviceType } from "@/hooks/use-device";
import {
  ArrowUpRight, CalendarDays, Wallet, TrendingUp, CalendarCheck,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList, AreaChart, Area, Tooltip,
} from "recharts";
import { LoadingBlock } from "@/components/LoadingScreen";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

/**
 * Which dashboard a business sees depends on whether the platform admin has
 * turned on the "rentals" page for them (see lib/features.ts):
 *  - rentals enabled  -> the original rentals-focused dashboard, unchanged.
 *  - rentals disabled -> a workers/attendance-focused dashboard instead,
 *    since that's all a labour-only business has to look at.
 */
function Dashboard() {
  const { business } = useSession();
  return isFeatureEnabled(business, "rentals") ? <RentalsDashboard /> : <WorkerDashboard />;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const sumAmount = (rows: Rental[]) => rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);

/** 12500 -> "12.5k", 250000 -> "2.5L", 30000000 -> "3Cr" (Indian style). */
function compact(n: number) {
  const a = Math.abs(n);
  const f = (v: number, s: string) => `${Number(v.toFixed(1))}${s}`;
  if (a >= 1e7) return f(n / 1e7, "Cr");
  if (a >= 1e5) return f(n / 1e5, "L");
  if (a >= 1e3) return f(n / 1e3, "k");
  return String(Math.round(n));
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function fmtDate(s: string) {
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(s: string) {
  const d = new Date(s);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

const AVATAR_TONES = [
  "bg-primary/10 text-primary",
  "bg-success/10 text-success",
  "bg-warning/15 text-warning",
  "bg-chart-5/15 text-chart-5",
];
const avatarTone = (name: string) => AVATAR_TONES[(name.charCodeAt(0) || 0) % AVATAR_TONES.length];

const STATUS_DOT: Record<Rental["status"], string> = {
  active: "bg-primary",
  returned: "bg-success",
  overdue: "bg-destructive",
};

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};

/**
 * Card padding used across the dashboard.
 *
 * The shared card-content component defaults to `p-4 pt-0 sm:p-6 sm:pt-0`.
 * Passing `p-4` only overrides the mobile value, so from `sm:` upward the top
 * padding stayed at 0 and content sat flush against the top edge of every card.
 * This plain wrapper owns its padding on every breakpoint instead.
 */
function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 p-4 sm:p-5", className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function ArrowLink({
  to, label,
}: { to: "/rentals" | "/reports" | "/labour" | "/manage-worker"; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/80 transition-colors hover:bg-primary hover:text-primary-foreground"
    >
      <ArrowUpRight className="h-4 w-4" />
    </Link>
  );
}

function CardTop({
  title, subtitle, to, linkLabel,
}: {
  title: string;
  subtitle: string;
  to: "/rentals" | "/reports" | "/labour" | "/manage-worker";
  linkLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-fluid-sm font-semibold leading-tight">{title}</p>
        <p className="text-fluid-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ArrowLink to={to} label={linkLabel} />
    </div>
  );
}

function Segmented<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex shrink-0 rounded-full bg-muted p-1 text-xs font-medium">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3.5 py-1.5 transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** ₹32,678.90 with the paise dimmed, like the reference. */
function Money({ value, className }: { value: number; className?: string }) {
  const [whole, dec] = Math.abs(Number(value || 0)).toFixed(2).split(".");
  return (
    <span className={className}>
      ₹{Number(whole).toLocaleString("en-IN")}
      <span className="text-muted-foreground">.{dec}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function RentalsDashboard() {
  const { data: rentals = [], isLoading } = useQuery({ queryKey: ["rentals"], queryFn: listRentals });
  const device = useDeviceType();
  const isMobile = device === "mobile";

  const { me, business } = useSession();
  const firstName = me?.role === "super_admin" ? "Admin" : (me?.name ?? "").trim().split(/\s+/)[0];
  const businessTitle = business ? (business.location ? `${business.name}, ${business.location}` : business.name) : "";

  const [barRange, setBarRange] = useState<"monthly" | "annually">("monthly");
  const [hovered, setHovered] = useState<number | null>(null);
  const [trendMode, setTrendMode] = useState<"issued" | "returned">("issued");

  /* ---------- numbers ---------- */
  const now = new Date();
  const today = now.toLocaleDateString("en-CA"); // local YYYY-MM-DD
  const active = rentals.filter((r) => r.status === "active");
  const overdue = rentals.filter((r) => r.status === "overdue");
  const returned = rentals.filter((r) => r.status === "returned");
  const dueToday = rentals.filter((r) => r.return_date === today && r.status !== "returned");
  const totalRevenue = sumAmount(rentals);

  const unpaid = rentals.filter((r) => r.payment_status === "unpaid");
  const unpaidAmount = sumAmount(unpaid);
  const unpaidShare = totalRevenue > 0 ? Math.round((unpaidAmount / totalRevenue) * 100) : 0;

  // last 6 months
  const monthly = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    const y = d.getFullYear();
    const m = d.getMonth();
    const created = rentals.filter((r) => {
      const c = new Date(r.created_at);
      return c.getFullYear() === y && c.getMonth() === m;
    });
    const back = returned.filter((r) => {
      const u = new Date(r.updated_at);
      return u.getFullYear() === y && u.getMonth() === m;
    });
    return {
      label: d.toLocaleString("en", { month: "short" }),
      revenue: sumAmount(created),
      issued: created.length,
      returned: back.length,
    };
  });

  // last 5 years
  const yearly = Array.from({ length: 5 }).map((_, i) => {
    const y = now.getFullYear() - (4 - i);
    const rows = rentals.filter((r) => new Date(r.created_at).getFullYear() === y);
    return { label: String(y), revenue: sumAmount(rows) };
  });

  const monthlyRevenue = monthly[5].revenue;
  const prevMonthRevenue = monthly[4].revenue;
  const monthDelta = prevMonthRevenue > 0 ? ((monthlyRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : null;

  const barData = barRange === "monthly" ? monthly : yearly;
  const revenues = barData.map((d) => d.revenue);
  const peak = Math.max(...revenues);
  const peakIdx = peak > 0 ? revenues.indexOf(peak) : barData.length - 1;
  const activeIdx = hovered ?? peakIdx;

  const trendValue = monthly[5][trendMode];

  // Customers whose material is due back today or is already late.
  const pendingRows = rentals.filter((r) => r.status !== "returned" && !!r.return_date && r.return_date <= today);
  const pendingCustomers = Array.from(new Set(pendingRows.map((r) => r.customer_name)));
  const shownAvatars = pendingCustomers.slice(0, 4);
  const extraCustomers = pendingCustomers.length - shownAvatars.length;

  const recent = rentals.slice(0, isMobile ? 5 : 5);

  const barChartHeight = isMobile ? 230 : device === "tablet" ? 260 : 290;

  return (
    <div className="space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-fluid-3xl font-semibold tracking-tight">
            Welcome Back{firstName && ","}{" "}
            <span className="font-normal text-muted-foreground">{firstName}</span>
          </h2>
          <p className="text-fluid-sm text-muted-foreground">
            Overview of rentals at {businessTitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-10 items-center gap-2 rounded-full border border-border/80 bg-card px-4 text-sm shadow-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* ---------- Main grid ---------- */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Left column: revenue card + this month */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardBody className="space-y-4">
              <CardTop
                title="Total Revenue"
                subtitle="All-time rental income"
                to="/reports"
                linkLabel="Open reports"
              />
              <div className="relative overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground">
                <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-primary-foreground/10" />
                <div className="pointer-events-none absolute -bottom-12 right-10 h-28 w-28 rounded-full bg-primary-foreground/10" />
                <div className="relative flex items-center justify-between">
                  <span className="text-lg font-extrabold tracking-wider">{business?.short_name ?? business?.name?.slice(0, 4) ?? ""}</span>
                  <span className="text-[11px] opacity-80">Revenue</span>
                </div>
                <p className="relative mt-5 truncate text-2xl font-bold xl:text-3xl" title={inr(totalRevenue)}>
                  {inr(totalRevenue)}
                </p>
                <div className="relative mt-5 flex items-center justify-between text-[11px] opacity-80">
                  <span>{rentals.length} rentals</span>
                  <span>{business?.location ?? ""}</span>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="lg:flex lg:flex-1 lg:flex-col">
            <CardBody className="lg:flex lg:flex-1 lg:flex-col lg:justify-center">
              <p className="text-fluid-xs text-muted-foreground">This Month</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-fluid-xl font-semibold">{inr(monthlyRevenue)}</p>
                {monthDelta !== null && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      monthDelta >= 0 ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {monthDelta >= 0 ? "+" : ""}
                    {monthDelta.toFixed(1)}%
                  </span>
                )}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Center: revenue bar chart */}
        <Card className="min-w-0 lg:col-start-2 lg:row-start-1">
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <p className="text-fluid-sm font-semibold">Revenue</p>
              </div>
              <div className="flex items-center gap-2">
                <Segmented
                  value={barRange}
                  onChange={(v) => {
                    setBarRange(v);
                    setHovered(null);
                  }}
                  options={[
                    { value: "monthly", label: "Monthly" },
                    { value: "annually", label: "Annually" },
                  ]}
                />
                <ArrowLink to="/reports" label="Open reports" />
              </div>
            </div>

            <div className="mt-4" style={{ height: barChartHeight }}>
              <ResponsiveContainer>
                <BarChart
                  data={barData}
                  margin={{ top: 34, right: 4, left: isMobile ? -18 : 0, bottom: 0 }}
                  barCategoryGap="18%"
                >
                  <defs>
                    <pattern id="revHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="6" height="6" fill="var(--chart-1)" fillOpacity={0.3} />
                      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-1)" strokeOpacity={0.5} strokeWidth={2} />
                    </pattern>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" opacity={0.4} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: isMobile ? 10 : 12, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={isMobile ? 34 : 42}
                    tickFormatter={(v: number) => compact(v)}
                    tick={{ fontSize: isMobile ? 10 : 12, fill: "var(--muted-foreground)" }}
                  />
                  <Bar
 isAnimationActive={false}
                    dataKey="revenue"
                    radius={999}
                    maxBarSize={48}
                    onMouseEnter={(_: any, i: number) => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={(_: any, i: number) => setHovered(i)}
                  >
                    {barData.map((_, i) => (
                      <Cell key={i} fill={i === activeIdx ? "var(--chart-1)" : "url(#revHatch)"} />
                    ))}
                    <LabelList
                      dataKey="revenue"
                      content={(p: any) => {
                        if (p.index !== activeIdx) return null;
                        const text = `₹${compact(Number(p.value))}`;
                        const w = text.length * 7 + 18;
                        const cx = p.x + p.width / 2;
                        return (
                          <g>
                            <rect x={cx - w / 2} y={p.y - 30} width={w} height={20} rx={10} fill="var(--chart-1)" />
                            <text
                              x={cx}
                              y={p.y - 16}
                              textAnchor="middle"
                              fontSize={11}
                              fontWeight={600}
                              fill="var(--primary-foreground)"
                            >
                              {text}
                            </text>
                          </g>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Right column: trend / to collect / pending returns */}
        <div className="grid min-w-0 gap-4 md:col-span-2 md:grid-cols-2 lg:contents">
          {/* Rentals trend — desktop: row 1, same height as the Revenue card */}
          <Card className="flex min-w-0 flex-col lg:col-start-3 lg:row-start-1">
            <CardBody className="flex flex-1 flex-col gap-3">
              <CardTop title="Rentals Trend" subtitle="Last 6 months" to="/rentals" linkLabel="Open rentals" />
              <div className="text-center">
                <p className="text-fluid-xs text-muted-foreground">
                  {trendMode === "issued" ? "Issued this month" : "Returned this month"}
                </p>
                <p className="text-fluid-3xl font-semibold">{trendValue}</p>
              </div>
              <div className="relative min-h-[110px] flex-1">
                <div className="absolute inset-0">
                  <ResponsiveContainer>
                    <AreaChart data={monthly} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" hide />
                      <YAxis hide domain={[0, (max: number) => Math.max(max, 1)]} />
                      <Tooltip contentStyle={tooltipStyle} cursor={false} />
                      <Area
 isAnimationActive={false}
                        type="monotone"
                        dataKey={trendMode}
                        name={trendMode === "issued" ? "Issued" : "Returned"}
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        fill="url(#trendFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="flex justify-center">
                <Segmented
                  value={trendMode}
                  onChange={setTrendMode}
                  options={[
                    { value: "issued", label: "Issued" },
                    { value: "returned", label: "Returned" },
                  ]}
                />
              </div>
            </CardBody>
          </Card>

          {/* Amount to collect */}
          <Card className="min-w-0 lg:col-start-3 lg:row-start-2">
            <CardBody className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-fluid-sm font-semibold leading-tight">Amount to Collect</p>
                    <p className="text-fluid-xs text-muted-foreground">
                      {unpaid.length} unpaid {unpaid.length === 1 ? "rental" : "rentals"}
                    </p>
                  </div>
                </div>
                <ArrowLink to="/rentals" label="Open rentals" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Money value={unpaidAmount} className="text-fluid-2xl font-semibold" />
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    unpaidAmount > 0 ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
                  )}
                >
                  {unpaidShare}% of revenue
                </span>
              </div>
            </CardBody>
          </Card>

          {/* Pending returns */}
          <Card className="min-w-0 md:col-span-2 lg:col-span-1 lg:col-start-3 lg:row-start-3">
            <CardBody className="space-y-3">
              <CardTop
                title="Pending Returns"
                subtitle="Due today & overdue"
                to="/rentals"
                linkLabel="Open rentals"
              />
              <div className="rounded-2xl bg-muted/70 p-3">
                {pendingCustomers.length === 0 ? (
                  <p className="py-2 text-center text-fluid-xs text-muted-foreground">
                    Nothing is due back right now.
                  </p>
                ) : (
                  <div className="flex items-center -space-x-2">
                    {shownAvatars.map((name) => (
                      <div
                        key={name}
                        title={name}
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ring-2 ring-card",
                          avatarTone(name),
                        )}
                      >
                        {initials(name)}
                      </div>
                    ))}
                    {extraCustomers > 0 && (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground ring-2 ring-card">
                        +{extraCustomers}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1 text-center">
                {[
                  { label: "Active", value: active.length, tone: "text-primary" },
                  { label: "Due", value: dueToday.length, tone: "text-warning" },
                  { label: "Overdue", value: overdue.length, tone: "text-destructive" },
                  { label: "Returned", value: returned.length, tone: "text-success" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className={cn("text-fluid-lg font-semibold", s.tone)}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Bottom: rental history */}
        <Card className="min-w-0 md:col-span-2 lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-2">
          <CardBody>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-fluid-sm font-semibold leading-tight">Rental History</p>
                <p className="text-fluid-xs text-muted-foreground">Recent rentals</p>
              </div>
              <ArrowLink to="/rentals" label="Open rentals" />
            </div>

            {/* Phone: stacked cards (a table's columns get crushed on a
                narrow screen). Tablet/desktop: the table below. */}
            {isMobile ? (
              <div className="mt-3 space-y-3">
                {isLoading && <LoadingBlock className="py-6" />}
                {!isLoading && recent.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No rentals yet. Create your first one from the Rentals page.
                  </p>
                )}
                {recent.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border/80 bg-background/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            avatarTone(r.customer_name),
                          )}
                        >
                          {initials(r.customer_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{r.customer_name}</p>
                          <p className="text-fluid-xs text-muted-foreground">{r.customer_phone}</p>
                        </div>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-fluid-sm">
                      <span className="text-muted-foreground">
                        {r.material_name} · {r.quantity} {r.unit}
                      </span>
                      <span className="font-semibold">{inr(Number(r.total_amount))}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-fluid-xs text-muted-foreground">
                      <span>Issued {fmtDate(r.issue_date)}</span>
                      <span className={r.payment_status === "paid" ? "text-success" : "text-destructive"}>
                        {r.payment_status === "paid" ? "Paid" : "Not paid"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-0 hover:bg-transparent">
                      <TableHead className="text-xs font-normal text-muted-foreground">Name</TableHead>
                      <TableHead className="text-xs font-normal text-muted-foreground">Date</TableHead>
                      <TableHead className="text-xs font-normal text-muted-foreground">Time</TableHead>
                      <TableHead className="text-xs font-normal text-muted-foreground">Status</TableHead>
                      <TableHead className="text-right text-xs font-normal text-muted-foreground">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <TableRow>
                        <TableCell colSpan={5} className="p-0"><LoadingBlock className="py-8" /></TableCell>
                      </TableRow>
                    )}
                    {!isLoading && recent.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          No rentals yet. Create your first one from the Rentals page.
                        </TableCell>
                      </TableRow>
                    )}
                    {recent.map((r) => (
                      <TableRow key={r.id} className="border-b-0 transition-colors hover:bg-muted/60">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                avatarTone(r.customer_name),
                              )}
                            >
                              {initials(r.customer_name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{r.customer_name}</p>
                              <p className="truncate text-[11px] text-primary">
                                {r.material_name} · {r.quantity} {r.unit}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{fmtDate(r.issue_date)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{fmtTime(r.created_at)}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2 text-sm capitalize">
                            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[r.status])} />
                            {r.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="whitespace-nowrap text-sm font-semibold">{inr(Number(r.total_amount))}</p>
                          <p
                            className={cn(
                              "text-[11px]",
                              r.payment_status === "paid" ? "text-success" : "text-destructive",
                            )}
                          >
                            {r.payment_status === "paid" ? "Paid" : "Not paid"}
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
/* ------------------------------------------------------------------ */
/* Worker / attendance dashboard (shown when a business has no        */
/* Rentals page — see the top-level Dashboard component above)        */
/* ------------------------------------------------------------------ */

type WorkerRow = {
  id: string;
  name: string;
  phone: string | null;
  daily_wage: number;
  active: boolean;
};

type AttendanceStatus = "present" | "absent" | "holiday";
type AttendanceDayType = "full" | "half" | "ot";
type AttendanceRow = {
  worker_id: string;
  work_date: string;
  status: AttendanceStatus;
  day_type: AttendanceDayType;
};

/** A present day pays this multiple of the worker's daily wage. */
const DAY_MULTIPLIER: Record<AttendanceDayType, number> = { full: 1, half: 0.5, ot: 1.5 };

async function listWorkers(): Promise<WorkerRow[]> {
  const { data, error } = await supabase
    .from("workers")
    .select("id, name, phone, daily_wage, active")
    .eq("role", "worker")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as WorkerRow[];
}

/** Every attendance row between two dates (inclusive), paging past the 1000-row API limit. */
async function fetchAttendanceRange(start: string, end: string): Promise<AttendanceRow[]> {
  const PAGE = 1000;
  const rows: AttendanceRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("worker_attendance")
      .select("worker_id, work_date, status, day_type")
      .gte("work_date", start)
      .lte("work_date", end)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as AttendanceRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function AttendanceBadge({ status }: { status: AttendanceStatus | "unmarked" }) {
  const map = {
    present: "bg-success/10 text-success border-success/40",
    absent: "bg-destructive/10 text-destructive border-destructive/40",
    holiday: "bg-warning/15 text-warning border-warning/40",
    unmarked: "bg-muted text-muted-foreground border-border",
  } as const;
  const label = status === "unmarked" ? "Not marked" : status;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold capitalize",
        map[status],
      )}
    >
      {label}
    </span>
  );
}

function WorkerDashboard() {
  const device = useDeviceType();
  const isMobile = device === "mobile";

  const { me, business } = useSession();
  const firstName = me?.role === "super_admin" ? "Admin" : (me?.name ?? "").trim().split(/\s+/)[0];
  const businessTitle = business ? (business.location ? `${business.name}, ${business.location}` : business.name) : "";

  const { data: workers = [], isLoading: workersLoading } = useQuery({
    queryKey: ["dashboard_workers"],
    queryFn: listWorkers,
  });

  const now = new Date();
  const today = now.toLocaleDateString("en-CA"); // local YYYY-MM-DD
  const rangeStart = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5);
    return d.toLocaleDateString("en-CA");
  })();

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ["dashboard_attendance", rangeStart, today],
    queryFn: () => fetchAttendanceRange(rangeStart, today),
  });

  const isLoading = workersLoading || attendanceLoading;
  const [hovered, setHovered] = useState<number | null>(null);

  const workerIds = new Set(workers.map((w) => w.id));
  const wageByWorker = new Map(workers.map((w) => [w.id, Number(w.daily_wage || 0)]));
  const activeWorkers = workers.filter((w) => w.active);

  const todayRows = attendance.filter((r) => r.work_date === today && workerIds.has(r.worker_id));
  const todayStatusByWorker = new Map(todayRows.map((r) => [r.worker_id, r.status]));
  const presentToday = todayRows.filter((r) => r.status === "present").length;
  const absentToday = todayRows.filter((r) => r.status === "absent").length;
  const holidayToday = todayRows.filter((r) => r.status === "holiday").length;
  const unmarkedToday = Math.max(workers.length - todayRows.length, 0);

  // last 6 months of present-days & estimated payroll
  const monthly = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    const y = d.getFullYear();
    const m = d.getMonth();
    const rows = attendance.filter((r) => {
      if (!workerIds.has(r.worker_id)) return false;
      const rd = new Date(`${r.work_date}T00:00:00`);
      return rd.getFullYear() === y && rd.getMonth() === m;
    });
    const presentRows = rows.filter((r) => r.status === "present");
    const payroll = presentRows.reduce(
      (s, r) => s + (wageByWorker.get(r.worker_id) ?? 0) * DAY_MULTIPLIER[r.day_type],
      0,
    );
    return { label: d.toLocaleString("en", { month: "short" }), present: presentRows.length, payroll };
  });

  const thisMonthPresent = monthly[5].present;
  const thisMonthPayroll = monthly[5].payroll;

  const attendanceCounts = monthly.map((m) => m.present);
  const peak = Math.max(...attendanceCounts);
  const peakIdx = peak > 0 ? attendanceCounts.indexOf(peak) : monthly.length - 1;
  const activeIdx = hovered ?? peakIdx;

  const barChartHeight = isMobile ? 230 : device === "tablet" ? 260 : 290;

  const sortedWorkers = [...workers].sort((a, b) => {
    const rank = (s?: AttendanceStatus) => (s === "present" ? 0 : s === "absent" ? 1 : s === "holiday" ? 2 : 3);
    return (
      rank(todayStatusByWorker.get(a.id)) - rank(todayStatusByWorker.get(b.id)) || a.name.localeCompare(b.name)
    );
  });
  const shownWorkers = sortedWorkers.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-fluid-3xl font-semibold tracking-tight">
            Welcome Back{firstName && ","}{" "}
            <span className="font-normal text-muted-foreground">{firstName}</span>
          </h2>
          <p className="text-fluid-sm text-muted-foreground">
            Workforce & attendance overview at {businessTitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-10 items-center gap-2 rounded-full border border-border/80 bg-card px-4 text-sm shadow-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </div>
          <Link
            to="/labour"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border/80 bg-card px-4 text-sm font-medium shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <CalendarCheck className="h-4 w-4" />
            Mark Attendance
          </Link>
        </div>
      </div>

      {/* ---------- Main grid ---------- */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Left column: worker count + this month */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardBody className="space-y-4">
              <CardTop
                title="Total Workers"
                subtitle="Everyone on the books"
                to="/manage-worker"
                linkLabel="Manage workers"
              />
              <div className="relative overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground">
                <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-primary-foreground/10" />
                <div className="pointer-events-none absolute -bottom-12 right-10 h-28 w-28 rounded-full bg-primary-foreground/10" />
                <div className="relative flex items-center justify-between">
                  <span className="text-lg font-extrabold tracking-wider">
                    {business?.short_name ?? business?.name?.slice(0, 4) ?? ""}
                  </span>
                  <span className="text-[11px] opacity-80">Workers</span>
                </div>
                <p className="relative mt-5 text-2xl font-bold xl:text-3xl">{workers.length}</p>
                <div className="relative mt-5 flex items-center justify-between text-[11px] opacity-80">
                  <span>{activeWorkers.length} active</span>
                  <span>{business?.location ?? ""}</span>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="lg:flex lg:flex-1 lg:flex-col">
            <CardBody className="lg:flex lg:flex-1 lg:flex-col lg:justify-center">
              <p className="text-fluid-xs text-muted-foreground">This Month</p>
              <p className="mt-1 min-w-0 truncate text-fluid-xl font-semibold">
                {thisMonthPresent} present-{thisMonthPresent === 1 ? "day" : "days"}
              </p>
            </CardBody>
          </Card>
        </div>

        {/* Center: attendance bar chart */}
        <Card className="min-w-0 lg:col-start-2 lg:row-start-1">
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <p className="text-fluid-sm font-semibold">Attendance</p>
              </div>
              <ArrowLink to="/labour" label="Open labour charges" />
            </div>

            <div className="mt-4" style={{ height: barChartHeight }}>
              <ResponsiveContainer>
                <BarChart
                  data={monthly}
                  margin={{ top: 34, right: 4, left: isMobile ? -18 : 0, bottom: 0 }}
                  barCategoryGap="18%"
                >
                  <defs>
                    <pattern id="attHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="6" height="6" fill="var(--chart-1)" fillOpacity={0.3} />
                      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-1)" strokeOpacity={0.5} strokeWidth={2} />
                    </pattern>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" opacity={0.4} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: isMobile ? 10 : 12, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={isMobile ? 34 : 42}
                    tickFormatter={(v: number) => compact(v)}
                    tick={{ fontSize: isMobile ? 10 : 12, fill: "var(--muted-foreground)" }}
                  />
                  <Bar
 isAnimationActive={false}
                    dataKey="present"
                    radius={999}
                    maxBarSize={48}
                    onMouseEnter={(_: any, i: number) => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={(_: any, i: number) => setHovered(i)}
                  >
                    {monthly.map((_, i) => (
                      <Cell key={i} fill={i === activeIdx ? "var(--chart-1)" : "url(#attHatch)"} />
                    ))}
                    <LabelList
                      dataKey="present"
                      content={(p: any) => {
                        if (p.index !== activeIdx) return null;
                        const text = `${compact(Number(p.value))} days`;
                        const w = text.length * 7 + 18;
                        const cx = p.x + p.width / 2;
                        return (
                          <g>
                            <rect x={cx - w / 2} y={p.y - 30} width={w} height={20} rx={10} fill="var(--chart-1)" />
                            <text
                              x={cx}
                              y={p.y - 16}
                              textAnchor="middle"
                              fontSize={11}
                              fontWeight={600}
                              fill="var(--primary-foreground)"
                            >
                              {text}
                            </text>
                          </g>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Right column: today's snapshot / payroll / active workers */}
        <div className="grid min-w-0 gap-4 md:col-span-2 md:grid-cols-2 lg:contents">
          <Card className="flex min-w-0 flex-col lg:col-start-3 lg:row-start-1">
            <CardBody className="flex flex-1 flex-col gap-3">
              <CardTop
                title="Today's Attendance"
                subtitle={now.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                to="/labour"
                linkLabel="Open labour charges"
              />
              <div className="grid grid-cols-4 gap-1 text-center">
                {[
                  { label: "Present", value: presentToday, tone: "text-success" },
                  { label: "Absent", value: absentToday, tone: "text-destructive" },
                  { label: "Holiday", value: holidayToday, tone: "text-warning" },
                  { label: "Unmarked", value: unmarkedToday, tone: "text-muted-foreground" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className={cn("text-fluid-lg font-semibold", s.tone)}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card className="min-w-0 lg:col-start-3 lg:row-start-2">
            <CardBody className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-fluid-sm font-semibold leading-tight">Payroll This Month</p>
                    <p className="text-fluid-xs text-muted-foreground">Estimated from attendance</p>
                  </div>
                </div>
                <ArrowLink to="/labour" label="Open labour charges" />
              </div>
              <Money value={thisMonthPayroll} className="text-fluid-2xl font-semibold" />
            </CardBody>
          </Card>

          <Card className="min-w-0 md:col-span-2 lg:col-span-1 lg:col-start-3 lg:row-start-3">
            <CardBody className="space-y-3">
              <CardTop title="Active Workers" subtitle="On active duty" to="/manage-worker" linkLabel="Manage workers" />
              <div className="rounded-2xl bg-muted/70 p-3">
                {activeWorkers.length === 0 ? (
                  <p className="py-2 text-center text-fluid-xs text-muted-foreground">No active workers yet.</p>
                ) : (
                  <div className="flex items-center -space-x-2">
                    {activeWorkers.slice(0, 4).map((w) => (
                      <div
                        key={w.id}
                        title={w.name}
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ring-2 ring-card",
                          avatarTone(w.name),
                        )}
                      >
                        {initials(w.name)}
                      </div>
                    ))}
                    {activeWorkers.length > 4 && (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground ring-2 ring-card">
                        +{activeWorkers.length - 4}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1 text-center">
                <div>
                  <p className="text-fluid-lg font-semibold text-success">{activeWorkers.length}</p>
                  <p className="text-[10px] text-muted-foreground">Active</p>
                </div>
                <div>
                  <p className="text-fluid-lg font-semibold text-muted-foreground">
                    {workers.length - activeWorkers.length}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Inactive</p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Bottom: worker list */}
        <Card className="min-w-0 md:col-span-2 lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-2">
          <CardBody>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-fluid-sm font-semibold leading-tight">Workers</p>
                <p className="text-fluid-xs text-muted-foreground">Today's status</p>
              </div>
              <ArrowLink to="/manage-worker" label="Manage workers" />
            </div>

            {isMobile ? (
              <div className="mt-3 space-y-3">
                {isLoading && <LoadingBlock className="py-6" />}
                {!isLoading && shownWorkers.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No workers yet. Add your first one from Manage Workers.
                  </p>
                )}
                {shownWorkers.map((w) => (
                  <div key={w.id} className="rounded-xl border border-border/80 bg-background/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            avatarTone(w.name),
                          )}
                        >
                          {initials(w.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{w.name}</p>
                          <p className="text-fluid-xs text-muted-foreground">{w.phone ?? "—"}</p>
                        </div>
                      </div>
                      <AttendanceBadge status={todayStatusByWorker.get(w.id) ?? "unmarked"} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-fluid-sm">
                      <span className="text-muted-foreground">
                        ₹{Number(w.daily_wage).toLocaleString("en-IN")}/day
                      </span>
                      <span className={w.active ? "text-success" : "text-muted-foreground"}>
                        {w.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-0 hover:bg-transparent">
                      <TableHead className="text-xs font-normal text-muted-foreground">Name</TableHead>
                      <TableHead className="text-xs font-normal text-muted-foreground">Phone</TableHead>
                      <TableHead className="text-xs font-normal text-muted-foreground">Status</TableHead>
                      <TableHead className="text-right text-xs font-normal text-muted-foreground">Daily Wage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <TableRow>
                        <TableCell colSpan={4} className="p-0"><LoadingBlock className="py-8" /></TableCell>
                      </TableRow>
                    )}
                    {!isLoading && shownWorkers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          No workers yet. Add your first one from Manage Workers.
                        </TableCell>
                      </TableRow>
                    )}
                    {shownWorkers.map((w) => (
                      <TableRow key={w.id} className="border-b-0 transition-colors hover:bg-muted/60">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                avatarTone(w.name),
                              )}
                            >
                              {initials(w.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{w.name}</p>
                              <p className="truncate text-[11px] text-primary">{w.active ? "Active" : "Inactive"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{w.phone ?? "—"}</TableCell>
                        <TableCell>
                          <AttendanceBadge status={todayStatusByWorker.get(w.id) ?? "unmarked"} />
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="whitespace-nowrap text-sm font-semibold">
                            ₹{Number(w.daily_wage).toLocaleString("en-IN")}
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}