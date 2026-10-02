import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Copy,
  ExternalLink,
  Link2,
  Moon,
  Navigation,
  Printer,
  RefreshCw,
  RotateCw,
  Sun,
} from "lucide-react";

import { useNavLinks } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";

/**
 * Right-click menu that opens right where the mouse is clicked, anywhere in the app.
 *
 *  - Always: Back, Forward, Refresh data, Reload page, Print, light/dark theme, and a
 *    "Go to" list of the pages this user can open.
 *  - When text is selected: Copy.   When a link is clicked: Open in new tab / Copy link.
 *
 * It stays out of the way where the normal browser menu is more useful: inside text boxes
 * (cut / copy / paste / spelling), while a dialog is open, on touch screens, and when you
 * hold Shift while right-clicking (Shift + right-click always gives the browser's own menu).
 * Anything that handles its own right-click (preventDefault) is left alone too.
 */

type MenuIcon = ComponentType<{ className?: string }>;

function Item({
  icon: Icon,
  label,
  onClick,
  trailing,
  active,
}: {
  icon: MenuIcon;
  label: string;
  onClick: () => void;
  trailing?: MenuIcon;
  active?: boolean;
}) {
  const Trailing = trailing;
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium outline-none",
        "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
        active && "bg-accent/60 text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {Trailing && <Trailing className="h-4 w-4 shrink-0 opacity-60" />}
    </button>
  );
}

function Divider() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older WebViews: fall back to a temporary textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }
}

export function GlobalContextMenu() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { links } = useNavLinks();

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [selection, setSelection] = useState("");
  const [linkHref, setLinkHref] = useState<string | null>(null);
  const [goOpen, setGoOpen] = useState(false);
  const [dark, setDark] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = () => setOpen(false);

  /* ---------- open on right-click ---------- */
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented || e.shiftKey) return;
      if (window.matchMedia?.("(pointer: coarse)").matches) return;

      const target = e.target;
      if (!(target instanceof Element)) return;

      // Keep the browser's own menu for text boxes, dialogs and opted-out areas.
      if (
        target.closest(
          'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-native-contextmenu]',
        )
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;

      e.preventDefault();
      setSelection(window.getSelection()?.toString().trim() ?? "");
      setLinkHref(anchor?.href ?? null);
      setDark(document.documentElement.classList.contains("dark"));
      setGoOpen(false);
      setPos({ x: e.clientX, y: e.clientY });
      setOpen(true);
    };

    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  /* ---------- close on outside click, Escape, scroll, resize, page change ---------- */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      );
      if (items.length === 0) return;
      e.preventDefault();

      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        e.key === "ArrowDown"
          ? (current + 1) % items.length
          : (current - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    const onHide = () => setOpen(false);

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onHide);
    window.addEventListener("blur", onHide);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onHide);
      window.removeEventListener("blur", onHide);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  /* ---------- keep the menu fully on screen ---------- */
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!open || !el) return;

    const margin = 8;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(margin, Math.min(pos.x, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.min(pos.y, window.innerHeight - height - margin));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [open, pos, goOpen, selection, linkHref]);

  if (!open || typeof document === "undefined") return null;

  /* ---------- actions ---------- */
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("mbs-theme", next ? "dark" : "light");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next ? "#0e1911" : "#f3f6ee");
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="More options"
      tabIndex={-1}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: "fixed", left: pos.x, top: pos.y }}
      className="z-[9999] max-h-[calc(100dvh-16px)] w-60 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-2xl animate-in fade-in-0 zoom-in-95"
    >
      {selection && (
        <>
          <Item
            icon={Copy}
            label="Copy"
            onClick={run(() => {
              void copyText(selection).then(() => toast.success("Copied"));
            })}
          />
          <Divider />
        </>
      )}

      {linkHref && (
        <>
          <Item
            icon={ExternalLink}
            label="Open link in new tab"
            onClick={run(() => {
              window.open(linkHref, "_blank", "noopener,noreferrer");
            })}
          />
          <Item
            icon={Link2}
            label="Copy link address"
            onClick={run(() => {
              void copyText(linkHref).then(() => toast.success("Link copied"));
            })}
          />
          <Divider />
        </>
      )}

      <Item icon={ArrowLeft} label="Back" onClick={run(() => window.history.back())} />
      <Item icon={ArrowRight} label="Forward" onClick={run(() => window.history.forward())} />
      <Item
        icon={RefreshCw}
        label="Refresh data"
        onClick={run(() => {
          void queryClient.invalidateQueries();
          toast.success("Refreshing data…");
        })}
      />
      <Item icon={RotateCw} label="Reload page" onClick={run(() => window.location.reload())} />

      <Divider />

      <Item icon={Printer} label="Print this page" onClick={run(() => window.print())} />
      <Item
        icon={dark ? Sun : Moon}
        label={dark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={run(toggleTheme)}
      />

      {links.length > 0 && (
        <>
          <Divider />
          <Item
            icon={Navigation}
            label="Go to"
            trailing={ChevronDown}
            active={goOpen}
            onClick={() => setGoOpen((v) => !v)}
          />
          {goOpen &&
            links.map(({ to, label, icon }) => (
              <Item
                key={to}
                icon={icon as MenuIcon}
                label={label}
                active={pathname === to || pathname.startsWith(to + "/")}
                onClick={run(() => {
                  void navigate({ to });
                })}
              />
            ))}
        </>
      )}
    </div>,
    document.body,
  );
}
