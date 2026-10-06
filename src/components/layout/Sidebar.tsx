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
  ChevronsLeft,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

import { ConfirmDelete } from "@/components/ConfirmDelete";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { WorkerLocationToggle } from "@/components/WorkerLocationToggle";
import { BrandLogo } from "@/components/BrandLogo";
import { AppCredit } from "@/components/AppCredit";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDeviceType } from "@/hooks/use-device";
import { lock } from "@/lib/auth/lock";
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
  const { me, business } = useSession();
  const locationSharingEnabled = isFeatureEnabled(business, "worker_locations");
  const isWorkerSidebar = workerName !== undefined;
  const accountName = (isWorkerSidebar ? workerName : me?.name) || "Account";
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
          {/* Account card — same idea as the desktop sidebar. For admins and
              managers the whole card opens "Manage my account" (which also holds
              Change password and Sign out). Workers get a plain card. */}
          <div className="flex items-stretch gap-2">
          {(() => {
            const initial = (accountName || "U").trim().charAt(0).toUpperCase() || "U";
            const cardInner = (
              <>
                <span className="more-avatar">{initial}</span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-bold leading-tight">
                    {accountName}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] font-semibold opacity-70">
                    {isWorkerSidebar ? "Worker" : "Manage account"}
                  </span>
                </span>
                {!isWorkerSidebar && <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />}
              </>
            );

            if (isWorkerSidebar) {
              return <div className="more-account min-w-0 flex-1">{cardInner}</div>;
            }

            return (
              <ChangePasswordDialog
                renderTrigger={(openDialog) => (
                  <button
                    type="button"
                    onClick={openDialog}
                    aria-label="Manage my account"
                    className="more-account more-account-btn min-w-0 flex-1"
                  >
                    {cardInner}
                  </button>
                )}
              />
            );
          })()}

          {/* Self-contained styling (no dependency on extra CSS): a square tile
              that stretches to the account card's height. */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            title={dark ? "Light mode" : "Dark mode"}
            className="flex w-14 shrink-0 cursor-pointer items-center justify-center self-stretch rounded-[1.4rem] border border-[rgb(79_122_61/0.16)] bg-white/60 text-inherit outline-none transition-all hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95 dark:border-white/12 dark:bg-white/[0.06] dark:hover:bg-white/[0.12]"
          >
            {/* Sun and moon swap with a quick spin. */}
            <span className="relative block h-[22px] w-[22px]">
              <Sun
                className={cn(
                  "absolute inset-0 h-[22px] w-[22px] transition-all duration-300",
                  dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0",
                )}
              />
              <Moon
                className={cn(
                  "absolute inset-0 h-[22px] w-[22px] transition-all duration-300",
                  dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
                )}
              />
            </span>
          </button>
          </div>

          {isWorkerSidebar && locationSharingEnabled && <WorkerLocationToggle workerId={workerId ?? null} />}

          {/* Workers have no account dialog, so they sign out from here;
              admins / managers sign out inside "Manage my account". */}
          {isWorkerSidebar && (
            <ConfirmDelete
              onConfirm={lock}
              title="Sign out of this worker account?"
              description="You will need to sign in again to view attendance and payment records."
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
          )}

          <AppCredit />
        </div>
      </div>
    </>
  );
}

/**
 * "MORE" SHEET (all sizes)
 * Opens from the bottom, right where the bottom-nav's "More" tab is.
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
 * TABLET "MORE" FLYOUT (768–1023px)
 * The rail's "More" button opens this compact panel anchored beside the rail.
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
 * DESKTOP SIDEBAR (>= 1024px)
 * Fixed, full-height, labelled sidebar that can collapse to an icon-only strip.
 * The width is driven by `--shell-sidebar-w`, which the shell root switches via
 * `data-sidebar="collapsed"` (see styles.css) — the page content's left padding
 * follows the same variable, so sidebar and content glide together.
 * Icons never move while it animates: every row uses constant horizontal padding
 * and only the text fades / clips away.
 */
function DesktopSidebar({
  workerName,
  workerId,
  dark,
  onToggleTheme,
  collapsed,
  onToggleCollapsed,
}: {
  workerName?: string;
  workerId?: string | null;
  dark: boolean;
  onToggleTheme: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const currentTab = useRouterState({
    select: (s) => (s.location.search as { tab?: string } | undefined)?.tab,
  });
  const { links } = useNavLinks();
  const { me, business } = useSession();
  const exploreItems = useExploreItems();

  const isWorker = workerName !== undefined;
  const brandName = business?.name ?? PLATFORM_NAME;
  const brandLocation = business?.location ?? "";
  const locationSharingEnabled = isFeatureEnabled(business, "worker_locations");
  const displayName = (isWorker ? workerName : me?.name) || "Account";
  const roleLabel =
    me?.role === "super_admin"
      ? "Platform admin"
      : me?.role
        ? String(me.role).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
        : "";

  // Text that fades + clips away when collapsed (icons stay put).
  const fade = (maxOpen: string) =>
    cn(
      "sb-fade overflow-hidden whitespace-nowrap",
      collapsed ? "max-w-0 opacity-0" : cn(maxOpen, "opacity-100"),
    );

  return (
    <aside
      aria-label="Sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className="sb-w fixed inset-y-0 left-0 z-40 hidden w-[var(--shell-sidebar-w)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex"
    >
      {/* Collapse / expand handle — straddles the sidebar's right edge */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
        className="sb-toggle group absolute -right-3 top-[1.9rem] z-50 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/70 shadow-md outline-none hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-90"
      >
        <ChevronsLeft
          className={cn(
            "sb-chevron h-3.5 w-3.5",
            collapsed
              ? "rotate-180 group-hover:translate-x-0.5"
              : "group-hover:-translate-x-0.5",
          )}
        />
      </button>

      {/* Brand */}
      <Link
        to={links[0]?.to ?? "/dashboard"}
        title={collapsed ? brandName : undefined}
        className="flex items-center gap-3 border-b border-sidebar-border px-[15px] py-5"
      >
        <BrandLogo alt={brandName} className="h-11 w-11 shrink-0" />
        <div className={fade("max-w-[10.5rem]")}>
          <div className="w-[10.5rem] shrink-0">
            <div className="line-clamp-2 whitespace-normal text-[15px] font-bold leading-tight tracking-tight">
              {brandName}
            </div>
            {brandLocation && (
              <div className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/60">
                {brandLocation}
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Navigation + quick links */}
      <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 py-[clamp(0.5rem,1.6vh,1rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          className={cn(
            "sb-fade mb-2 overflow-hidden whitespace-nowrap px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/55",
            collapsed ? "h-0 opacity-0" : "h-4 opacity-100",
          )}
        >
          Menu
        </div>

        {/* Collapsed: bigger, roomier icons in two groups — the main pages at the
            top, the rest pinned toward the bottom behind a divider — so the
            strip is filled evenly instead of leaving a big empty gap. */}
        <nav
          className={cn("flex flex-col", collapsed ? "flex-1 gap-[clamp(0.125rem,0.7vh,0.375rem)]" : "gap-0.5")}
          aria-label="Primary"
        >
          {(collapsed
            ? [...links.filter((l) => l.primary), ...links.filter((l) => !l.primary)]
            : links
          ).map((item, index, list) => {
            const { to, label, icon: Icon } = item;
            const tab = (item as { tab?: string }).tab;
            const active = tab
              ? path === to && currentTab === tab
              : to === "/worker"
                ? path === to && !currentTab
                : path === to || path.startsWith(to + "/");
            const startsSecondary =
              collapsed && !item.primary && index > 0 && list[index - 1].primary;

            return (
              <Fragment key={`${to}${tab ?? ""}`}>
                {startsSecondary && (
                  <div className="mx-2 mb-0.5 mt-auto border-t border-sidebar-border pt-2" aria-hidden />
                )}
                <Link
                  to={to}
                  search={(tab ? { tab } : {}) as never}
                  title={collapsed ? label : undefined}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "sb-item relative flex items-center gap-3 rounded-lg px-[17px] text-sm font-semibold transition-colors",
                    collapsed ? "py-[clamp(0.375rem,1.4vh,0.75rem)]" : "py-2",
                    active
                      ? "bg-sidebar-accent text-primary before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-r-full before:bg-primary"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="sb-icon h-[18px] w-[18px] shrink-0" />
                  <span className={cn(fade("max-w-[12rem]"), "truncate")}>{label}</span>
                </Link>
              </Fragment>
            );
          })}
        </nav>

        {!collapsed && exploreItems.length > 0 && (
          <div className="sb-reveal mt-6 border-t border-sidebar-border pt-5">
            <div className="flex items-center gap-2 px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/55">
              <Compass className="h-3.5 w-3.5" />
              Explore
            </div>
            <div className="flex flex-wrap gap-2 px-3">
              {exploreItems.map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  title={label}
                  aria-label={label}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noreferrer" : undefined}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sidebar-foreground transition-all hover:-translate-y-0.5 hover:bg-primary/30"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Account footer */}
      <div className="space-y-2.5 overflow-hidden border-t border-sidebar-border p-3">
        {!collapsed && isWorker && locationSharingEnabled && (
          <WorkerLocationToggle workerId={workerId ?? null} />
        )}

        {(() => {
          const cardInner = (
            <>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground transition-transform group-hover/acct:scale-105">
                {displayName.trim().charAt(0).toUpperCase() || "U"}
              </div>
              <div className={cn(fade("max-w-[10rem]"), "min-w-0 text-left")}>
                <div className="truncate text-sm font-semibold leading-tight">{displayName}</div>
                {(isWorker ? roleLabel : "Manage account") && (
                  <div
                    className={cn(
                      "mt-0.5 truncate text-[11px]",
                      isWorker
                        ? "text-sidebar-foreground/65"
                        : "font-medium text-primary",
                    )}
                  >
                    {isWorker ? roleLabel : "Manage account"}
                  </div>
                )}
              </div>
            </>
          );
          const cardClass = cn(
            "flex w-full items-center gap-3 rounded-xl px-2 py-2 transition-colors",
            collapsed ? "justify-start bg-transparent" : "bg-sidebar-accent/60",
          );

          // Workers have no account dialog — plain card. Everyone else: the
          // card itself opens "Manage my account".
          if (isWorker) {
            return <div className={cardClass}>{cardInner}</div>;
          }

          return (
            <ChangePasswordDialog
              renderTrigger={(openDialog) => (
                <button
                  type="button"
                  onClick={openDialog}
                  aria-label="Manage my account"
                  title="Manage my account"
                  className={cn(
                    cardClass,
                    "group/acct cursor-pointer outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.98]",
                  )}
                >
                  {cardInner}
                </button>
              )}
            />
          );
        })()}

        <div className={cn("flex gap-2", collapsed && "flex-col")}>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            title={dark ? "Light mode" : "Dark mode"}
            className={cn(
              "group/theme flex shrink-0 items-center justify-center border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground outline-none transition-all hover:border-primary/50 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95",
              collapsed
                ? "mx-auto h-10 w-10 rounded-xl"
                : isWorker
                  ? "h-9 w-9 rounded-lg"
                  : "h-9 w-full rounded-lg",
            )}
          >
            {/* Sun and moon sit on top of each other and swap with a spin. */}
            <span className="relative block h-[18px] w-[18px]">
              <Sun
                className={cn(
                  "absolute inset-0 h-[18px] w-[18px] transition-all duration-300",
                  dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0",
                )}
              />
              <Moon
                className={cn(
                  "absolute inset-0 h-[18px] w-[18px] transition-all duration-300",
                  dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
                )}
              />
            </span>
            {!isWorker && (
              <span className={cn(fade("ml-2 max-w-[7rem]"), "text-xs font-semibold")}>
                {dark ? "Light mode" : "Dark mode"}
              </span>
            )}
          </button>

          {/* Admins / managers sign out from inside "Manage my account";
              workers have no account dialog, so they keep a button here. */}
          {isWorker && (
            <ConfirmDelete
              onConfirm={lock}
              title="Sign out of this worker account?"
              description="You will need to sign in again to view attendance and payment records."
              confirmLabel="Sign out"
            >
              <Button
                variant="default"
                size="sm"
                aria-label="Sign out"
                title="Sign out"
                className={cn(
                  "h-9 min-w-0 justify-center rounded-lg bg-primary px-0 font-semibold",
                  collapsed ? "w-full flex-none" : "flex-1",
                )}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className={cn(fade("ml-2 max-w-[6rem]"))}>Sign out</span>
              </Button>
            </ConfirmDelete>
          )}
        </div>

        {!collapsed && (
          <div className="sb-reveal">
            <AppCredit />
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * NAVIGATION BAR
 * Phones: floating glass dock. Tablet (md–lg): slim icon rail on the left.
 * Desktop (lg+): hidden — DesktopSidebar takes over.
 * The first 4 `primary` nav items, plus a permanent "More" tab that
 * opens the "More" card (remaining nav items, explore links, theme,
 * account) — a bottom sheet at every size. Fixed to the viewport bottom, safe-area
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
  // Quick action above the tabs; shown only when this account
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
  const routePath = useRouterState({ select: (s) => s.location.pathname });


  // Phone: bottom sheet. Tablet: flyout beside the rail. Desktop: the full
  // sidebar already lists everything, so there is no "More" surface.
  const deviceType = useDeviceType();

  // Desktop sidebar: expanded (labelled) vs collapsed (icon-only). Remembered
  // across visits. `sidebarAnimate` stays false for the first frame so a saved
  // "collapsed" state is applied instantly instead of animating on page load.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarAnimate, setSidebarAnimate] = useState(false);
  const toggleSidebar = () =>
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mbs-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* storage unavailable — just don't persist */
      }
      return next;
    });

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem("mbs-sidebar-collapsed") === "1");
    } catch {
      /* ignore */
    }
    const id = requestAnimationFrame(() => setSidebarAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Ctrl/Cmd + B toggles the sidebar (desktop only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b" && window.innerWidth >= 1024) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    <div
      className="flex min-h-dvh shell-root"
      data-sidebar={sidebarCollapsed ? "collapsed" : "expanded"}
      data-anim={sidebarAnimate ? "1" : "0"}
    >
      {/* ==========================================
          "MORE" SURFACE
          Phone: bottom sheet, matching the bottom-nav
          tab it's opened from. Tablet/desktop: a
          compact flyout anchored beside the rail.
          Workers use the same shell as admins now.
         ========================================== */}

      {deviceType === "mobile" && (
        <Sheet open={mobileMoreOpen} onOpenChange={setMobileMoreOpen}>
          <SheetContent
            side="bottom"
            className="inset-x-auto bottom-[calc(0.7rem+env(safe-area-inset-bottom,0px))] left-2 right-2 mx-auto max-h-[85dvh] max-w-[27rem] rounded-[2rem] border-0 bg-transparent p-0 shadow-none [&>button]:hidden"
          >
            <MobileMoreSheet
              onNav={() => setMobileMoreOpen(false)}
              {...sharedSidebarProps}
            />
          </SheetContent>
        </Sheet>
      )}

      {deviceType === "tablet" && (
        <MoreFlyout
          open={mobileMoreOpen}
          onOpenChange={setMobileMoreOpen}
          onNav={() => setMobileMoreOpen(false)}
          {...sharedSidebarProps}
        />
      )}

      {deviceType === "desktop" && (
        <DesktopSidebar
          {...sharedSidebarProps}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
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

              <div className="flex min-w-0 flex-1 items-center gap-2">
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
          {/* Keyed by path: each page fades in softly instead of snapping. */}
          <div key={routePath} className="page-enter">
            {children}
          </div>
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