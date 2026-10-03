import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Boxes,
  FileBarChart,
  Receipt,
  Moon,
  Sun,
  LogOut,
  NotebookPen,
  HardHat,
  RefreshCw,
  Globe,
  Instagram,
  Youtube,
  MessageCircle,
  Phone,
  MapPin,
  MapPinned,
  MessagesSquare,
  UserCog,
  Compass,
  MoreHorizontal,
  Building2,
  Inbox,
  Settings,
  Plus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

import { ConfirmDelete } from "@/components/ConfirmDelete";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { WorkerLocationToggle } from "@/components/WorkerLocationToggle";
import { BrandLogo } from "@/components/BrandLogo";
import { AppCredit } from "@/components/AppCredit";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDeviceType } from "@/hooks/use-device";
import { lock } from "@/lib/auth/gate";
import { useSession } from "@/lib/auth/session";
import { PLATFORM_NAME } from "@/lib/brand";
import { isMasterAdmin, isSuperAdmin } from "@/lib/auth/access";
import { isFeatureEnabled, type FeatureKey } from "@/lib/features";

/**
 * `primary: true` marks the items that get a permanent slot in the
 * mobile bottom tab bar and are shown first (in order) on the tablet
 * icon rail. Everything else is still reachable — on mobile via the
 * "More" tab, on tablet by scrolling the rail — it's just not one of
 * the handful of items that get thumb-reach priority. Tune freely.
 *
 * `shortLabel`, where set, is what the bottom-nav tab shows instead
 * of the full `label` — the tab is only ~72px wide, so "Labour
 * Charges" has to become "Labour" there rather than truncate with an
 * ellipsis. The rail and every sheet/menu still use the full `label`.
 */
const nav = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: Home,
    primary: true,
  },
  {
    to: "/rentals",
    label: "Rentals",
    icon: Boxes,
    primary: true,
    feature: "rentals",
  },
  {
    to: "/platform/businesses",
    label: "Businesses",
    icon: Building2,
    superOnly: true,
    primary: true,
  },
  {
    to: "/platform/users",
    label: "Users",
    icon: UserCog,
    superOnly: true,
    primary: true,
  },
  {
    to: "/platform/requests",
    label: "Requests",
    icon: Inbox,
    superOnly: true,
    primary: true,
  },
  {
    to: "/manage-worker",
    label: "Manage Users",
    icon: UserCog,
    adminOnly: true,
  },
  {
    to: "/labour",
    label: "Labour Charges",
    shortLabel: "Labour",
    icon: HardHat,
    adminOnly: true,
    primary: true,
    feature: "labour",
  },
  {
    to: "/worker-locations",
    label: "Worker Locations",
    icon: MapPinned,
    adminOnly: true,
    feature: "worker_locations",
  },
  {
    to: "/diary",
    label: "Diary / Notes",
    icon: NotebookPen,
    feature: "diary",
  },
  {
    to: "/reports",
    label: "Reports",
    icon: FileBarChart,
    feature: "reports",
  },
  {
    to: "/receipts",
    label: "Receipts",
    icon: Receipt,
    primary: true,
    feature: "receipts",
  },
  {
    to: "/feedback",
    label: "Worker Feedback",
    icon: MessagesSquare,
    adminOnly: true,
    feature: "feedback",
  },
  {
    to: "/business-settings",
    label: "Business Settings",
    icon: Settings,
    adminOnly: true,
  },
];

export function useNavLinks() {
  const { me, business } = useSession();
  const worker = me?.role === "worker";

  let links;
  if (worker) {
    links = [
      {
        to: "/worker",
        label: "My Attendance & Payments",
        shortLabel: "Attendance",
        icon: HardHat,
        primary: true,
      },
      {
        // Same route, `?tab=feedback` (see routes/_authenticated/worker.tsx).
        to: "/worker",
        tab: "feedback",
        label: "Feedback",
        icon: MessagesSquare,
        primary: true,
      },
    ];
  } else if (me?.role === "super_admin") {
    // The platform admin only manages businesses and their users.
    links = nav.filter((item) => item.superOnly);
  } else {
    // Only show a page if this business has been assigned it (or it isn't a
    // togglable page at all — Dashboard, Manage Users, Business Settings).
    links = nav.filter(
      (item) =>
        !item.superOnly &&
        (!item.adminOnly || isMasterAdmin()) &&
        (!item.feature || isFeatureEnabled(business, item.feature as FeatureKey)),
    );
  }

  return { links, worker };
}

function NavLinks({ onClick }: { onClick?: () => void }) {
  const path = useRouterState({
    select: (s) => s.location.pathname,
  });
  const { links } = useNavLinks();

  return (
    <nav className="flex flex-col gap-1 px-4 py-5">
      {links.map(({ to, label, icon: Icon }) => {
        const active = path === to || path.startsWith(to + "/");

        return (
          <Link
            key={to}
            to={to}
            onClick={onClick}
            className={cn(
              "touch-target flex items-center gap-3 text-sm font-semibold transition-all",
              active
                ? "rounded-xl bg-sidebar-accent px-4 py-3 text-primary"
                : "rounded-xl px-4 py-3 text-sidebar-foreground hover:bg-sidebar-accent",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Explore more — same plain circle-icon + label tile used by the
 * secondary nav grid (Diary / Notes, Reports, etc.) rather than its own
 * bordered, tinted card style, so "Explore more" reads as one more row
 * of nav tiles instead of a visually distinct block.
 */
function useExploreItems() {
  const { business } = useSession();
  const contact = business?.whatsapp || (business?.phone ? `91${business.phone.replace(/\D/g, "")}` : "");
  return [
    business?.website_url && { href: business.website_url, label: "Official website", icon: Globe },
    business?.instagram_url && { href: business.instagram_url, label: "Instagram", icon: Instagram },
    business?.youtube_url && { href: business.youtube_url, label: "YouTube", icon: Youtube },
    contact && { href: `https://wa.me/${contact}`, label: "WhatsApp", icon: MessageCircle },
    business?.maps_url && { href: business.maps_url, label: "Visit location", icon: MapPin },
    contact && { href: `tel:+${contact}`, label: "Call Now", icon: Phone },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Globe }[];
}

function ExploreLinks() {
  const exploreLinks = useExploreItems();
  if (exploreLinks.length === 0) return null;
  return (
    <div className="mx-4 mt-5 border-t border-sidebar-border pt-5">
      <div className="flex items-center gap-2 px-3 pb-3 text-xs font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/65">
        <Compass className="h-4 w-4" />
        Explore more
      </div>

      <div className="grid grid-cols-4 gap-1 px-1">
        {exploreLinks.map(({ href, label, icon: Icon }) => (
          <a
            key={href}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noreferrer" : undefined}
            className="group touch-target flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center transition-colors hover:bg-sidebar-accent"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/25 text-sidebar-foreground transition-colors group-hover:bg-primary/35">
              <Icon className="h-5 w-5" />
            </span>
            <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-sidebar-foreground">
              {label}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * "Signed in as" text block for the admin/manager sidebar — same plain
 * style as the worker sidebar's version, just above Sign out. Covers both
 * a workers-table row login (admin or manager role) and the single shared
 * master login, which has no row and is always full admin.
 */
function SignedInLabel() {
  const { me } = useSession();
  if (!me) return null;

  return (
    <div className="min-w-0 text-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">
        Signed in as
      </div>

      <div className="truncate font-semibold">{me.name}</div>
      {me.role === "super_admin" && (
        <div className="mt-0.5 truncate text-xs text-sidebar-foreground/70">Platform admin</div>
      )}
    </div>
  );
}

function SidebarContent({
  onNav,
  workerName,
  workerId,
  dark,
  onToggleTheme,
}: {
  onNav?: () => void;
  workerName?: string;
  workerId?: string | null;
  dark: boolean;
  onToggleTheme: () => void;
}) {
  const isWorkerSidebar = workerName !== undefined;
  const { business } = useSession();
  const brandName = business?.name ?? PLATFORM_NAME;
  const brandLocation = business?.location ?? "";
  const locationSharingEnabled = isFeatureEnabled(business, "worker_locations");

  const ThemeToggle = (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggleTheme}
      className="w-full justify-center gap-2 font-semibold"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}

      {dark ? "Light mode" : "Dark mode"}
    </Button>
  );

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* ================================
          ADMIN / MANAGER SIDEBAR
         ================================ */}
      {!isWorkerSidebar && (
        <>
          {/* MOBILE/TABLET LOGO + TITLE */}
          <div className="flex items-center gap-2 p-4 lg:hidden">
            <BrandLogo alt={brandName} className="h-9 w-9" />

            <div className="min-w-0">
              <div className="text-sm font-bold leading-tight tracking-tight">
                {brandName}
              </div>

              {brandLocation && (
                <div className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/70">
                  {brandLocation}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-4">
            <NavLinks onClick={onNav} />
            <ExploreLinks />
          </div>

          <div className="space-y-2 border-t border-sidebar-border p-4">
            {ThemeToggle}

            <ChangePasswordDialog />

            <SignedInLabel />

            <ConfirmDelete
              onConfirm={lock}
              title="Sign out of this account?"
              description="You will need to sign in again to access the dashboard."
              confirmLabel="Sign out"
            >
              <Button
                variant="default"
                size="sm"
                className="w-full justify-center rounded-lg bg-primary font-semibold"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </ConfirmDelete>

            <AppCredit />

            <div className="text-[11px] leading-relaxed text-sidebar-foreground/60">
              {brandName}
            </div>
          </div>
        </>
      )}

      {/* ================================
          WORKER SIDEBAR
         ================================ */}
      {isWorkerSidebar && (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col items-center px-6 pt-8 text-center">
              <BrandLogo alt={brandName} ringWidth={4} className="h-28 w-28" />

              <div className="mt-4 text-base font-bold tracking-tight">{brandName}</div>

              {brandLocation && (
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/65">
                  {brandLocation}
                </div>
              )}
            </div>

            <ExploreLinks />
          </div>

          <div className="space-y-3 border-t border-sidebar-border p-4">
            {ThemeToggle}

            {locationSharingEnabled && <WorkerLocationToggle workerId={workerId ?? null} />}

            <div className="min-w-0 text-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">
                Signed in as
              </div>

              <div className="truncate font-semibold">{workerName || "Worker"}</div>
            </div>

            <ConfirmDelete
              onConfirm={lock}
              title="Sign out of this worker account?"
              description="You will need to sign in again to view attendance and payment records."
              confirmLabel="Sign out"
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </ConfirmDelete>

            <AppCredit />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * "MORE" MENU CONTENT — shared by the phone bottom sheet and the tablet /
 * desktop flyout, so both look exactly the same: a "More" header with a close
 * button, a 3-column grid of round icon chips, then the theme / account
 * controls and Sign out.
 */
function MoreMenuContent({
  onClose,
  workerName,
  workerId,
  dark,
  onToggleTheme,
}: {
  onClose: () => void;
  workerName?: string;
  workerId?: string | null;
  dark: boolean;
  onToggleTheme: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { links } = useNavLinks();
  const { business } = useSession();
  const locationSharingEnabled = isFeatureEnabled(business, "worker_locations");
  const isWorkerSidebar = workerName !== undefined;
  // Everything without a permanent nav slot — those are already one tap away.
  const secondary = links.filter((l) => !l.primary);
  // Workers have no extra pages, so their grid is the business's contact /
  // social shortcuts — same tiles, same tray as the admin's More panel.
  const exploreItems = useExploreItems();
  const hasTiles = isWorkerSidebar ? exploreItems.length > 0 : secondary.length > 0;

  return (
    <>
      <div className="more-head">
        <span className="text-base font-bold tracking-tight">More</span>
        <button type="button" onClick={onClose} aria-label="Close" className="more-close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {hasTiles && (
          <div className="more-inset grid grid-cols-3 gap-1">
            {isWorkerSidebar
              ? exploreItems.map(({ href, label, icon: Icon }) => (
                  <a
                    key={href}
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={href.startsWith("http") ? "noreferrer" : undefined}
                    onClick={onClose}
                    className="more-tile"
                  >
                    <span className="more-chip">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="line-clamp-2 text-[11px] font-semibold leading-tight">
                      {label}
                    </span>
                  </a>
                ))
              : secondary.map(({ to, label, icon: Icon }) => {
                  const active = path === to || path.startsWith(to + "/");

                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={onClose}
                      className={cn("more-tile", active && "more-tile-active")}
                    >
                      <span className="more-chip">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="line-clamp-2 text-[11px] font-semibold leading-tight">
                        {label}
                      </span>
                    </Link>
                  );
                })}
          </div>
        )}

        <div className={cn("space-y-2.5", hasTiles && "mt-3")}>
          {/* Admin/manager: theme + account buttons sit side by side.
              Worker: theme button stays full width, location toggle below. */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleTheme}
              className="more-btn min-w-0 flex-1 justify-center gap-2 whitespace-nowrap px-2 text-xs font-semibold"
            >
              {dark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
              {dark ? "Light mode" : "Dark mode"}
            </Button>

            {!isWorkerSidebar && (
              <ChangePasswordDialog className="more-btn min-w-0 flex-1 whitespace-nowrap px-2 text-xs" />
            )}
          </div>

          {isWorkerSidebar && locationSharingEnabled && <WorkerLocationToggle workerId={workerId ?? null} />}

          {isWorkerSidebar ? (
            <div className="min-w-0 text-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Signed in as
              </div>
              <div className="truncate font-semibold">{workerName || "Worker"}</div>
            </div>
          ) : (
            <SignedInLabel />
          )}

          <ConfirmDelete
            onConfirm={lock}
            title={isWorkerSidebar ? "Sign out of this worker account?" : "Sign out of this account?"}
            description={
              isWorkerSidebar
                ? "You will need to sign in again to view attendance and payment records."
                : "You will need to sign in again to access the dashboard."
            }
            confirmLabel="Sign out"
          >
            <Button
              variant="default"
              size="sm"
              className="more-signout w-full justify-center font-semibold"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </ConfirmDelete>

          <AppCredit />
        </div>
      </div>
    </>
  );
}

/**
 * PHONE "MORE" SHEET (< 768px)
 * Opens from the bottom (where the bottom-nav's "More" tab is). It shows the
 * same card as the tablet/desktop flyout — see MoreMenuContent.
 */
function MobileMoreSheet({
  onNav,
  workerName,
  workerId,
  dark,
  onToggleTheme,
}: {
  onNav?: () => void;
  workerName?: string;
  workerId?: string | null;
  dark: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <div className="more-panel flex max-h-[min(34rem,calc(100dvh-2rem))] flex-col overflow-hidden">
      <MoreMenuContent
        onClose={() => onNav?.()}
        workerName={workerName}
        workerId={workerId}
        dark={dark}
        onToggleTheme={onToggleTheme}
      />
    </div>
  );
}

/**
 * TABLET/DESKTOP "MORE" FLYOUT (>= 768px)
 * The rail's "More" button opens this compact panel anchored beside the rail
 * (a full-width bottom drawer stretched across a big screen reads as an
 * oversized, empty box). The card itself is MoreMenuContent, shared with the
 * phone sheet.
 */
function MoreFlyout({
  open,
  onOpenChange,
  onNav,
  workerName,
  workerId,
  dark,
  onToggleTheme,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNav?: () => void;
  workerName?: string;
  workerId?: string | null;
  dark: boolean;
  onToggleTheme: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-950/20"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />

      <div
        role="dialog"
        aria-label="More"
        className="more-panel fixed bottom-4 left-[calc(var(--shell-rail-w)+0.75rem)] z-50 flex max-h-[min(34rem,calc(100dvh-2rem))] w-[21rem] flex-col overflow-hidden"
      >
        <MoreMenuContent
          onClose={() => {
            onNav?.();
            onOpenChange(false);
          }}
          workerName={workerName}
          workerId={workerId}
          dark={dark}
          onToggleTheme={onToggleTheme}
        />
      </div>
    </>
  );
}


/**
 * NAVIGATION BAR
 * Phones: floating bottom tab bar. Tablet/desktop (md+): fixed icon rail on
 * the left — logo on top, the main tabs beneath it, and "More" pinned to the
 * very bottom of the rail.
 * The first 4 `primary` nav items, plus a permanent "More" tab that
 * opens the "More" card (remaining nav items, explore links, theme,
 * account) — a bottom sheet on phones, a flyout beside the rail on larger screens. Fixed to the viewport bottom, safe-area
 * aware (see `.shell-bottomnav` in styles.css) so it clears the iOS
 * home indicator when installed as a standalone PWA.
 */
function BottomNav({
  onOpenMore,
  isMoreOpen,
}: {
  onOpenMore: () => void;
  isMoreOpen: boolean;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const currentTab = useRouterState({
    select: (s) => (s.location.search as { tab?: string } | undefined)?.tab,
  });
  const { links } = useNavLinks();

  const primary = links.filter((l) => l.primary).slice(0, 4);
  const tabs = primary.length > 0 ? primary : links.slice(0, 4);
  // Phone-only quick action above the tabs; shown only when this account
  // actually has the Rentals page.
  const canAddRental = links.some((l) => l.to === "/rentals");
  // Only admins whose business has the Worker Locations page get this one.
  const canSeeWorkerLocations = links.some((l) => l.to === "/worker-locations");

  return (
    <nav
      className="shell-bottomnav md:overflow-y-auto md:overflow-x-hidden md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden"
      aria-label="Primary"
    >
      <Link
        to={links[0]?.to ?? "/dashboard"}
        aria-label="Home"
        className="hidden shrink-0 items-center justify-center md:mb-2 md:flex"
      >
        <BrandLogo alt="Logo" className="h-9 w-9" />
      </Link>

      <div className="shell-dock">
        {(canAddRental || canSeeWorkerLocations) && (
          <div className="shell-actions">
            {canAddRental && (
              <Link
                to="/rentals"
                search={{ new: true }}
                aria-label="Add rental"
                className="shell-addpill"
              >
                <Plus className="h-4 w-4" />
                Add Rental
              </Link>
            )}
            {canSeeWorkerLocations && (
              <Link
                to="/worker-locations"
                aria-label="Worker locations"
                className="shell-addpill"
              >
                <MapPinned className="h-4 w-4" />
                W Locations
              </Link>
            )}
          </div>
        )}

      <div className="shell-navbar">
        {tabs.map((item) => {
          const { to, label, shortLabel, icon: Icon } = item;
          const tab = (item as { tab?: string }).tab;
          // Worker tabs share `/worker` and differ by `?tab=`.
          const active = tab
            ? path === to && currentTab === tab
            : to === "/worker"
              ? path === to && !currentTab
              : path === to || path.startsWith(to + "/");

          return (
            <Link
              key={`${to}${tab ?? ""}`}
              to={to}
              search={(tab ? { tab } : {}) as never}
              title={label}
              aria-label={label}
              className={cn("shell-navtab", active && "shell-navtab-active")}
            >
              <Icon className="shell-navtab-icon" />
              <span className="shell-navtab-label">{shortLabel ?? label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          aria-label="More"
          title="More"
          className={cn("shell-navtab md:mt-auto md:shrink-0", isMoreOpen && "shell-navtab-active")}
        >
          <MoreHorizontal className="shell-navtab-icon" />
          <span className="shell-navtab-label">More</span>
        </button>
      </div>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile header title: slow "scroll -> stop -> scroll" marquee         */
/* ------------------------------------------------------------------ */

/**
 * The business name shown in the mobile header, next to the logo.
 * Static — no scrolling/sliding. If the name is too long for the
 * available width it's simply truncated with an ellipsis.
 */
function MobileMarqueeTitle({ text }: { text: string }) {
  return (
    <div className="min-w-0 flex-1">
      <h1 className="truncate text-fluid-sm font-bold leading-6 sm:text-base sm:leading-6">
        {text}
      </h1>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  /*
   * IMPORTANT:
  * true = desktop sidebar OPEN after login/refresh.
   *
  * The mobileMoreOpen state controls the More tab's bottom sheet.
   */
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // Which "More" surface to render for it: a bottom sheet on phones,
  // a compact flyout anchored beside the rail on tablet/desktop. See
  // MobileMoreSheet / MoreFlyout below.
  const deviceType = useDeviceType();
  const isMobileDevice = deviceType === "mobile";

  const [dark, setDark] = useState(false);
  const { me, business } = useSession();
  const worker = me?.role === "worker";
  const workerName = me?.name ?? "Worker";
  const workerId = me?.workerId ?? null;

  /* ================================
     LOAD THEME
     ================================ */
  useEffect(() => {
    const stored = localStorage.getItem("mbs-theme");

    if (stored === "dark") {
      document.documentElement.classList.add("dark");
      setDark(true);
    }
  }, []);

  // The right-click menu can also switch the theme: follow the <html class="dark"> flag so
  // the sidebar's own toggle always shows the real state.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  /* ================================
     THEME TOGGLE
     ================================ */
  const toggleTheme = () => {
    const next = !dark;

    setDark(next);

    document.documentElement.classList.toggle("dark", next);

    localStorage.setItem("mbs-theme", next ? "dark" : "light");

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", next ? "#0e1911" : "#f3f6ee");
    }
  };

  const sharedSidebarProps = {
    workerName: worker ? workerName : undefined,
    workerId: worker ? workerId : undefined,
    dark,
    onToggleTheme: toggleTheme,
  };

  return (
    // NOTE: `shell-root` (not the `bg-background` utility) on purpose — see
    // the comment on `.shell-root` in styles.css. `bg-background` carries a
    // `backdrop-filter`, and a `backdrop-filter` on this div (an ancestor of
    // the fixed `.shell-bottomnav` below) turns it into the containing block
    // for that fixed nav, so the nav bounces along with the page instead of
    // staying pinned to the screen during over-swipe.
    <div className="flex min-h-dvh shell-root">
      {/* ==========================================
          "MORE" SURFACE
          Phone: bottom sheet, matching the bottom-nav
          tab it's opened from. Tablet/desktop: a
          compact flyout anchored beside the rail.
          Workers use the same shell as admins now.
         ========================================== */}

      {isMobileDevice ? (
        <Sheet open={mobileMoreOpen} onOpenChange={setMobileMoreOpen}>
          <SheetContent
            side="bottom"
            className="inset-x-auto bottom-[calc(0.7rem+env(safe-area-inset-bottom,0px))] left-2 right-2 mx-auto max-h-[85vh] max-w-[27rem] rounded-[2rem] border-0 bg-transparent p-0 shadow-none [&>button]:hidden"
          >
            <MobileMoreSheet
              onNav={() => setMobileMoreOpen(false)}
              {...sharedSidebarProps}
            />
          </SheetContent>
        </Sheet>
      ) : (
        <MoreFlyout
          open={mobileMoreOpen}
          onOpenChange={setMobileMoreOpen}
          onNav={() => setMobileMoreOpen(false)}
          {...sharedSidebarProps}
        />
      )}

      {/* ==========================================
          MAIN CONTENT AREA
         ========================================== */}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="site-header sticky top-0 z-40 h-16 border-b border-border px-4 lg:px-6 md:hidden">
          <div className="flex h-full items-center justify-between gap-4">
            {/* =====================================
                LEFT SIDE
               ===================================== */}

            <div className="flex min-w-0 flex-1 items-center gap-3">
              {/* ===================================
                  MOBILE LOGO/TITLE
                  Tablet already shows the logo atop
                  its rail (admin/manager only); desktop
                  inside the full sidebar — so this is
                  phone-only for admin/manager. For a
                  worker (no rail), show it up to lg too.
                 =================================== */}

              <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
                <BrandLogo alt="Logo" className="h-9 w-9" />

                <MobileMarqueeTitle text={business?.name ?? PLATFORM_NAME} />
              </div>
            </div>

            {/* =====================================
                RIGHT SIDE
               ===================================== */}

            <div className="flex items-center gap-1" />
          </div>
        </header>

        {/* ========================================
            PAGE CONTENT
           ======================================== */}

        <main
          className="page-pad shell-content-offset flex-1 overflow-x-hidden"
        >
          {children}
        </main>

        {/* ========================================
            RESPONSIVE ADMIN NAVIGATION
            Admin/manager only — workers use the
            classic sidebar at every screen size. It is a bottom bar on
            mobile and a left icon rail on tablet/desktop.
           ======================================== */}

        <BottomNav
          onOpenMore={() => setMobileMoreOpen(true)}
          isMoreOpen={mobileMoreOpen}
        />
      </div>
    </div>
  );
}