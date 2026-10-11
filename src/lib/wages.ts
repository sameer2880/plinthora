/**
 * Wage helpers shared by Labour Charges, the dashboard and the exports.
 *
 * DB values for attendance.day_type stay "full" | "half" | "ot" (so old records keep working);
 * the screens show them as Day / Half day / Full day + OT.
 */
export type DayType = "full" | "half" | "ot" | "ot_only";

export const DAY_TYPES: DayType[] = ["full", "half", "ot", "ot_only"];
/** Button order: Full day + OT, Day, Half day, OT. */
export const DAY_TYPE_ORDER: DayType[] = ["ot", "full", "half", "ot_only"];

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  full: "Day",
  half: "Half day",
  ot: "Full day + OT",
  ot_only: "OT",
};

export type WorkerRates = {
  daily_wage?: number | string | null;
  wage_day?: number | string | null;
  wage_half?: number | string | null;
  wage_full_ot?: number | string | null;
  wage_ot?: number | string | null;
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/** The worker's rate (₹) for a given kind of present day. */
export function rateFor(worker: WorkerRates | null | undefined, dayType: DayType): number {
  if (!worker) return 0;
  if (dayType === "half") return num(worker.wage_half);
  if (dayType === "ot") return num(worker.wage_full_ot);
  if (dayType === "ot_only") return num(worker.wage_ot);
  return num(worker.wage_day);
}

/** True when the worker has at least one of the three new rates set. */
export const hasNewRates = (w: WorkerRates | null | undefined) =>
  !!w && (num(w.wage_day) > 0 || num(w.wage_half) > 0 || num(w.wage_full_ot) > 0 || num(w.wage_ot) > 0);

/**
 * What a present day earned.
 *  - New marks carry the rate that applied that day (`wage`), so changing a rate later
 *    never rewrites history.
 *  - Old marks have no `wage`; they are calculated the way they always were:
 *    daily_wage x legacyFactor[day_type].
 */
export function earnedFor(
  att: { day_type: DayType | null; wage?: number | string | null },
  worker: WorkerRates | null | undefined,
  legacyFactor: Record<DayType, number>,
): number {
  if (att.wage !== null && att.wage !== undefined) return num(att.wage);
  return num(worker?.daily_wage) * (legacyFactor[att.day_type ?? "full"] ?? 1);
}

/** Rate to store on an attendance row being saved (keeps the old snapshot if nothing changed). */
export function wageToStore(
  worker: WorkerRates | null | undefined,
  dayType: DayType,
  existing?: { day_type: DayType; wage: number | null } | null,
): number | null {
  if (existing && existing.wage !== null && existing.day_type === dayType) return existing.wage;
  // Old record being re-saved unchanged: leave it as legacy.
  if (existing && existing.wage === null && existing.day_type === dayType) return null;
  if (!hasNewRates(worker)) return null; // worker still on the old single wage
  return rateFor(worker, dayType);
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** "Full day + OT ₹1,500 · Day ₹1,000 · Half day ₹500" — or the old "₹1,000/day" for workers not moved over yet. */
export function wageSummary(w: WorkerRates): string {
  if (!hasNewRates(w)) return `${inr(num(w.daily_wage))}/day`;
  return `Full day + OT ${inr(num(w.wage_full_ot))} · Day ${inr(num(w.wage_day))} · Half day ${inr(num(w.wage_half))} · OT ${inr(num(w.wage_ot))}`;
}