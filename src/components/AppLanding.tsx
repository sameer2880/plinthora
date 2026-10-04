import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/brand";
import { Link } from "@tanstack/react-router";
import {
  Home,
  Receipt,
  ShieldCheck,
  Truck,
  Users,
  ClipboardList,
  BarChart3,
  MessageSquare,
  MapPin,
  CalendarCheck,
  StickyNote,
} from "lucide-react";
import { StyledQr } from "@/components/StyledQr";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandName } from "@/components/BrandName";

const APK_URL = "https://plinthoraapk.vercel.app/Plinthora.apk";
const APK_SIZE = "7.8 MB";

const QR_STEPS = [
  { title: "Scan the QR code", body: "Open the camera or QR scanner on your Android phone." },
  { title: "Download the APK", body: "Tap the link and confirm the download if asked." },
  { title: "Install & open Plinthora", body: "Open Plinthora.apk from Downloads. If prompted, allow installs from this source, then tap Install." },
] as const;

/* ------------------------------------------------------------------ */
/* Page styles                                                        */
/* ------------------------------------------------------------------ */

const HERO_CSS = `
.marquee-row {
  display: flex;
  width: max-content;
  animation: marquee-scroll 34s linear infinite;
}

.marquee-row--reverse {
  animation-direction: reverse;
  animation-duration: 40s;
}

@keyframes marquee-scroll {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(-50%);
  }
}

.wave-line {
  animation: wave-flow 11s ease-in-out infinite;
  will-change: transform;
}

@keyframes wave-flow {
  0%,
  100% {
    transform: translate(0, 0);
  }

  50% {
    transform: translate(18px, 26px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .marquee-row,
  .wave-line {
    animation: none !important;
  }
}
`;

/* ------------------------------------------------------------------ */
/* Feature list                                                       */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { icon: Users, label: "Manage workers" },
  { icon: CalendarCheck, label: "Attendance" },
  { icon: MessageSquare, label: "Feedback" },
  { icon: MapPin, label: "Worker locations" },
  { icon: Truck, label: "Manage rentals" },
  { icon: Receipt, label: "Receipts" },
  { icon: BarChart3, label: "Reports" },
  { icon: ClipboardList, label: "Diary" },
  { icon: StickyNote, label: "Notes" },
] as const;

function FeaturePill({
  icon: Icon,
  label,
}: {
  icon: typeof Users;
  label: string;
}) {
  return (
    <span className="mr-2.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[11px] font-medium text-white/70">
      <Icon className="size-3.5 text-[#a8d977]" />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Flowing wave-line background                                       */
/* ------------------------------------------------------------------ */

function HeroWaveLines({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  const lineCount = 90;

  return (
    <svg
      viewBox="0 0 1200 900"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      {Array.from({ length: lineCount }, (_, i) => {
        const y = -120 + i * 11;
        const bow = i * 2.4;
        const fade = i / lineCount;

        const opacity =
          0.025 + Math.sin(fade * Math.PI) * 0.16;

        return (
          <path
            key={i}
            d={`
              M -120 ${y + 170}
              C 220 ${y + 170},
                380 ${y - 30 + bow},
                640 ${y + 145 + bow}
              S 1120 ${y - 55 + bow},
                1320 ${y - 100 + bow}
            `}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeOpacity={opacity}
            className={animated ? "wave-line" : undefined}
            style={
              animated
                ? { animationDelay: `-${(i * 0.17).toFixed(2)}s` }
                : undefined
            }
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Landing page                                                       */
/* ------------------------------------------------------------------ */

export function AppLanding() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <style>{HERO_CSS}</style>

      {/* ============================================================ */}
      {/* FULL PAGE WAVE BACKGROUND                                    */}
      {/* ============================================================ */}

      <HeroWaveLines
        className="
          pointer-events-none
          absolute
          inset-0
          z-0
          h-full
          w-full
          text-foreground
          opacity-50
        "
      />

      {/* ============================================================ */}
      {/* PAGE CONTENT                                                  */}
      {/* ============================================================ */}

      <div className="relative z-10">

        {/* ========================================================== */}
        {/* HERO                                                        */}
        {/* ========================================================== */}

        <div className="relative flex flex-col overflow-hidden bg-[#0a130d] lg:h-dvh">

          {/* Green hero wave lines */}

          <HeroWaveLines
            animated
            className="
              pointer-events-none
              absolute
              inset-0
              z-0
              h-full
              w-full
              text-[#d9f5c0]
              opacity-40
            "
          />

          {/* Hero glow */}

          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-24 z-0 h-[26rem] w-[26rem] rounded-full bg-[#7ab558]/25 blur-[100px]"
          />

          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 top-1/3 z-0 h-[22rem] w-[22rem] rounded-full bg-[#22331c]/60 blur-[100px]"
          />

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_rgba(168,217,119,0.08),_transparent_60%)]"
          />

          {/* ======================================================== */}
          {/* NAV                                                       */}
          {/* ======================================================== */}

          <div className="relative z-10 flex items-center px-6 pt-6 sm:px-10 sm:pt-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <BrandLogo className="h-8 w-8 shrink-0" alt={PLATFORM_NAME} />
              <BrandName
                className="truncate text-base font-bold tracking-tight"
                onDark
              />
            </div>
          </div>

          {/* ======================================================== */}
          {/* HERO GRID: welcome (left) + app download (right)          */}
          {/* ======================================================== */}

          <div className="relative z-10 grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">

            {/* ---------------- LEFT: WELCOME ---------------- */}

            <div className="relative flex flex-col items-center justify-center px-6 pb-14 pt-10 text-center sm:px-10 sm:pb-20 sm:pt-14 lg:min-h-0 lg:py-6">

              {/* Logo in the top-left corner (desktop) */}
              <div className="absolute left-10 top-8 hidden items-center gap-2.5 lg:flex">
                <BrandLogo className="h-8 w-8 shrink-0" alt={PLATFORM_NAME} />
                <BrandName
                  className="truncate text-base font-bold tracking-tight"
                  onDark
                />
              </div>

              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#c8e896] sm:text-[13px]">
                One app, every device
              </span>

              <h1 className="mt-6 text-5xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-[clamp(2.75rem,8.5vh,4.5rem)]">
                Welcome to <BrandName onDark />
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg xl:text-xl">
                Manage your workforce, rentals, payments and records
                effortlessly — in one app.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-white/75 sm:text-base">
                <span>Real-time tracking</span>
                <span className="text-white/25">•</span>
                <span>Secure records</span>
                <span className="text-white/25">•</span>
                <span>1-click sign in</span>
              </div>

              <Button
                asChild
                className="mt-10 h-14 w-full gap-2.5 rounded-full bg-[#a8d977] px-10 text-base font-semibold text-[#0e1911] shadow-lg shadow-[#a8d977]/25 hover:bg-[#c8e896] sm:w-auto sm:px-12"
              >
                <Link to="/dashboard">
                  <Home className="size-5" />
                  Go to dashboard
                </Link>
              </Button>

              <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/65">
                <ShieldCheck className="size-5 shrink-0 text-[#a8d977]" />
                You'll be asked to sign in with your account.
              </div>
            </div>

            {/* ---------------- RIGHT: QR DOWNLOAD (desktop only) ---------------- */}

            <aside className="hidden flex-col items-center justify-center border-l border-white/[0.07] bg-transparent px-8 py-6 text-center lg:flex lg:min-h-0 lg:overflow-hidden xl:px-12">

              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a8d977]">
                Plinthora for Android
              </span>

              <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
                Take Plinthora with you
              </h2>

              <p className="mt-1.5 text-xs text-white/60">
                Your workforce, rentals and records. On your phone.
              </p>

              {/* QR card */}
              <div className="mt-5 drop-shadow-[0_8px_22px_rgba(34,230,90,0.22)]">
                <StyledQr
                  value={APK_URL}
                  size={152}
                  label="QR code to download the Plinthora Android app"
                />
              </div>

              <p className="mt-4 text-sm font-semibold text-white">
                Scan QR to download the app
              </p>
              <p className="mt-1 text-[11px] text-white/50">
                Android only · APK · {APK_SIZE}
              </p>

              <div className="my-4 h-px w-full max-w-[16rem] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

              {/* Steps */}
              <ol className="w-full max-w-xs space-y-3 text-left">
                {QR_STEPS.map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[#a8d977]/40 bg-[#a8d977]/10 text-xs font-semibold text-[#c8e896]">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold leading-snug text-white">
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <p className="mt-4 text-[11px] text-white/45">
                iPhone &amp; iPad? Use <span className="text-white/70">Go to dashboard</span>.
              </p>
            </aside>
          </div>

          {/* ======================================================== */}
          {/* FEATURE MARQUEE                                          */}
          {/* ======================================================== */}

          <div className="relative z-10 space-y-2.5 overflow-hidden pb-8 lg:shrink-0 lg:pb-6 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">

            <div className="marquee-row">
              {[...FEATURES, ...FEATURES, ...FEATURES, ...FEATURES].map((f, i) => (
                <FeaturePill
                  key={`r1-${i}`}
                  icon={f.icon}
                  label={f.label}
                />
              ))}
            </div>

            <div className="marquee-row marquee-row--reverse">
              {[
                ...FEATURES.slice().reverse(),
                ...FEATURES.slice().reverse(),
                ...FEATURES.slice().reverse(),
                ...FEATURES.slice().reverse(),
              ].map((f, i) => (
                <FeaturePill
                  key={`r2-${i}`}
                  icon={f.icon}
                  label={f.label}
                />
              ))}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}