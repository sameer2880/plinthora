import type { Business } from "@/lib/auth/session";

/**
 * The optional pages a business can be assigned. Keep this list in sync with
 * `_all_feature_keys()` in supabase/migrations/20260923000000_business_page_features.sql.
 *
 * `path` is the route this feature gates — used both to hide the nav item
 * (Sidebar.tsx) and to bounce a direct URL visit away if the business hasn't
 * been assigned the page (Gate.tsx).
 *
 * Pages NOT in this list (Dashboard, Manage Users, Business Settings, and
 * the Platform-admin-only screens) are always available — they aren't
 * something the platform admin turns on/off per business.
 */
export type FeatureKey =
  | "rentals"
  | "labour"
  | "worker_locations"
  | "diary"
  | "reports"
  | "receipts"
  | "feedback";

export interface FeaturePage {
  key: FeatureKey;
  label: string;
  description: string;
  path: string;
}

export const FEATURE_PAGES: FeaturePage[] = [
  { key: "rentals", label: "Rentals", description: "Track rental items, quantities and payments", path: "/rentals" },
  { key: "labour", label: "Labour Charges", description: "Labour charge entries and receipts", path: "/labour" },
  {
    key: "worker_locations",
    label: "Worker Locations",
    description: "Live location sharing/tracking for workers",
    path: "/worker-locations",
  },
  { key: "diary", label: "Diary / Notes", description: "Daily diary and notes", path: "/diary" },
  { key: "reports", label: "Reports", description: "Business summary reports", path: "/reports" },
  { key: "receipts", label: "Receipts", description: "Rental & labour receipts", path: "/receipts" },
  { key: "feedback", label: "Worker Feedback", description: "Worker feedback & complaints", path: "/feedback" },
];

export const ALL_FEATURE_KEYS: FeatureKey[] = FEATURE_PAGES.map((f) => f.key);

/**
 * Whether `business` has been assigned `key`. Fails OPEN (treats the page as
 * enabled) when the business hasn't loaded yet or the column is missing —
 * that only matters for an instant during load / before the migration runs,
 * and the database's own RLS + the `guard_business_update` trigger are the
 * real enforcement anyway; this is purely about what the UI shows.
 */
export function isFeatureEnabled(business: Pick<Business, "enabled_pages"> | null | undefined, key: FeatureKey): boolean {
  if (!business || business.enabled_pages == null) return true;
  return business.enabled_pages.includes(key);
}

/** The feature (if any) that gates a given pathname, e.g. "/rentals/123" -> the "rentals" feature. */
export function featureForPath(pathname: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((f) => pathname === f.path || pathname.startsWith(f.path + "/"));
}