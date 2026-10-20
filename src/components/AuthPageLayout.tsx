import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandWordmark } from "@/components/BrandWordmark";
import { LoginIllustration } from "@/components/LoginIllustration";
import { WaveLines } from "@/components/WaveLines";
import { PLATFORM_TAGLINE } from "@/lib/brand";

/**
 * Full-screen page used by the signed-out screens that used to be pop-up cards
 * (forgot password, request access). It is a real page, so touching the edges
 * of the screen can never close it — the only ways out are the Back / Cancel
 * buttons and the browser or phone back button.
 */
export function AuthPageLayout({
  children,
  backTo = "/dashboard",
  backLabel = "Back to sign in",
  onBack,
}: {
  children: ReactNode;
  /** Where the top "Back" link goes (the sign-in page lives at /dashboard when signed out). */
  backTo?: string;
  backLabel?: string;
  /** Overrides the top link (e.g. to step back inside a multi-step page). */
  onBack?: () => void;
}) {
  const backClass =
    "inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline";

  return (
    <div className="relative flex min-h-dvh w-full bg-[#eef6e6] dark:bg-[#0a130d]">
      <WaveLines className="pointer-events-none absolute inset-0 z-0 h-full w-full text-[#5d8749] opacity-45 dark:text-[#d9f5c0] dark:opacity-30" />
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 z-0 h-[28rem] w-[28rem] rounded-full bg-[#7ab558]/20 blur-[110px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-40 z-0 h-[30rem] w-[30rem] rounded-full bg-[#7ab558]/15 blur-[110px]" />

      {/* Illustration panel — same look as the sign-in page, wide screens only */}
      <aside className="relative z-10 hidden overflow-hidden bg-gradient-to-br from-[#7ab558] via-primary to-[#22331c] split:flex split:w-[42%] split:items-center split:justify-center">
        <WaveLines className="pointer-events-none absolute inset-0 z-0 h-full w-full text-white opacity-45" />
        <div className="relative z-10 flex flex-col items-center gap-8">
          <div className="rounded-[2.5rem] bg-white/10 p-8 backdrop-blur-sm">
            <LoginIllustration className="h-56 w-56 drop-shadow-2xl" />
          </div>
          <div className="text-center text-white/90">
            <p className="text-lg font-semibold">Track every rental. Grow every day.</p>
            <p className="mt-1 text-sm text-white/60">{PLATFORM_TAGLINE}</p>
          </div>
        </div>
      </aside>

      {/* The page itself */}
      <main className="relative z-10 flex min-h-dvh flex-1 flex-col overflow-y-auto px-6 pb-10 pt-[calc(1.5rem+env(safe-area-inset-top))] sm:px-10 split:px-14">
        <header className="flex items-center justify-between gap-3">
          {onBack ? (
            <button type="button" onClick={onBack} className={backClass}>
              <ArrowLeft className="h-4 w-4" /> {backLabel}
            </button>
          ) : (
            <Link to={backTo as never} replace className={backClass}>
              <ArrowLeft className="h-4 w-4" /> {backLabel}
            </Link>
          )}
          <div className="flex items-center gap-2">
            <BrandLogo className="h-8 w-8" />
            <BrandWordmark className="h-4" />
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-8">{children}</div>
      </main>
    </div>
  );
}

/** Heading block shared by the pages. */
export function AuthPageHeading({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</span>
      )}
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">{title}</h1>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}