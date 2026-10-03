import { useEffect, useState } from "react";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/brand";
import { Link } from "@tanstack/react-router";
import {
  Download,
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandName } from "@/components/BrandName";

// Keep in sync with the AndroidManifest `package` in the shipped APK.
const ANDROID_PACKAGE = "com.mbscentring.works";
const APK_URL = "/downloads/mbs-works.apk";
const APP_VERSION = "1.0";

type Device = "android" | "ios" | "desktop";

function detectDevice(): Device {
  if (typeof navigator === "undefined") return "desktop";

  const ua = navigator.userAgent;

  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";

  return "desktop";
}

/* ------------------------------------------------------------------ */
/* Platform symbols                                                   */
/* ------------------------------------------------------------------ */

type IconProps = {
  className?: string;
};

function AndroidIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5506-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z" />
    </svg>
  );
}

function AppleIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function DesktopIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2.5" />
      <rect x="8" y="19.5" width="8" height="2" rx="1" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Page styles                                                        */
/* ------------------------------------------------------------------ */

const HERO_CSS = `
.live-dot {
  display: inline-flex;
  width: 9px;
  height: 9px;
  align-items: center;
  justify-content: center;
  animation: live-dot-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}

.live-dot-core {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  background: radial-gradient(circle at 30% 30%, #c8e896, #a8d977 70%);
  box-shadow: 0 0 8px 1px rgba(168, 217, 119, 0.6);
  animation: live-dot-breathe 2.4s ease-in-out infinite;
}

.live-dot-ring {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: #a8d977;
  opacity: 0;
  animation: live-dot-ping 2.4s cubic-bezier(0, 0, 0.2, 1) infinite;
}

.live-dot-ring-2 {
  animation-delay: 1.2s;
}

@keyframes live-dot-pop {
  from {
    transform: scale(0);
    opacity: 0;
  }

  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes live-dot-ping {
  0% {
    transform: scale(1);
    opacity: 0.55;
  }

  80%,
  100% {
    transform: scale(3.2);
    opacity: 0;
  }
}

@keyframes live-dot-breathe {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.15);
  }
}

.marquee-row {
  display: flex;
  width: max-content;
  gap: 0.625rem;
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

@media (prefers-reduced-motion: reduce) {
  .live-dot,
  .live-dot-core,
  .live-dot-ring {
    animation: none !important;
  }

  .live-dot-ring {
    display: none;
  }

  .marquee-row {
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
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[11px] font-medium text-white/70">
      <Icon className="size-3.5 text-[#a8d977]" />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Flowing wave-line background                                       */
/* ------------------------------------------------------------------ */

function HeroWaveLines({ className }: { className?: string }) {
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
  const [detected, setDetected] = useState<Device>("desktop");
  const [pick, setPick] = useState<Device>("desktop");

  useEffect(() => {
    const d = detectDevice();

    setDetected(d);
    setPick(d);
  }, []);

  const devicePanels = {
    android: {
      title: "Phone & tablet",
      body: "Download the free APK and install it directly — no Play Store needed.",
      cta: (
        <Button
          asChild
          className="mt-4 h-11 w-full gap-2 rounded-full text-sm font-semibold sm:w-auto sm:px-8"
        >
          <a href={APK_URL} download>
            <Download className="size-4" />
            Download APK
          </a>
        </Button>
      ),
    },

    ios: {
      title: "iPhone & iPad",
      body: "There's no App Store app yet — use the dashboard in Safari, then add it to your Home Screen for the full-screen app feel.",
      cta: (
        <Button
          asChild
          className="mt-4 h-11 w-full gap-2 rounded-full text-sm font-semibold sm:w-auto sm:px-8"
        >
          <Link to="/dashboard">
            <Home className="size-4" />
            Open in Safari
          </Link>
        </Button>
      ),
    },

    desktop: {
      title: "Windows, Mac & Linux",
      body: "No install needed — use Chrome, Safari or Firefox for the best experience.",
      cta: (
        <Button
          asChild
          className="mt-4 h-11 w-full gap-2 rounded-full text-sm font-semibold sm:w-auto sm:px-8"
        >
          <Link to="/dashboard">
            <Home className="size-4" />
            Open the dashboard
          </Link>
        </Button>
      ),
    },
  } as const;

  const activePanel = devicePanels[pick];

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

        <div className="relative overflow-hidden bg-[#0a130d]">

          {/* Green hero wave lines */}

          <HeroWaveLines
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

          <div className="relative z-10 flex items-center px-6 pt-6 sm:px-10 sm:pt-8">
            <div className="flex items-center gap-2.5">

              <BrandLogo
                className="h-8 w-8 shrink-0"
                alt={PLATFORM_NAME}
              />

              <BrandName
                className="truncate text-base font-bold tracking-tight"
                onDark
              />

            </div>
          </div>

          {/* ======================================================== */}
          {/* HEADLINE                                                  */}
          {/* ======================================================== */}

          <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 pb-14 pt-10 text-center sm:px-10 sm:pb-20 sm:pt-14">

            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1 text-[11px] font-medium uppercase tracking-wide text-[#c8e896]">
              One app, every device
            </span>

            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl">
              Welcome to <BrandName onDark />
            </h1>

            {/* NEW TAGLINE */}

            <p className="mx-auto mt-4 max-w-xl text-sm text-white/60 sm:text-base">
              Manage your workforce, rentals, payments and records effortlessly
              — in one app.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-white/70">
              <span>Real-time tracking</span>

              <span className="text-white/25">•</span>

              <span>Secure records</span>

              <span className="text-white/25">•</span>

              <span>1-click sign in</span>
            </div>

            <Button
              asChild
              className="mt-8 h-12 w-full gap-2 rounded-full bg-[#a8d977] px-8 text-sm font-semibold text-[#0e1911] shadow-lg shadow-[#a8d977]/20 hover:bg-[#c8e896] sm:w-auto"
            >
              <Link to="/dashboard">
                <Home className="size-4" />
                Go to dashboard
              </Link>
            </Button>

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-white/60">
              <ShieldCheck className="size-4 shrink-0 text-[#a8d977]" />
              You'll be asked to sign in with your account.
            </div>

          </div>

          {/* ======================================================== */}
          {/* FEATURE MARQUEE                                          */}
          {/* ======================================================== */}

          <div className="relative z-10 space-y-2.5 overflow-hidden pb-10 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">

            <div className="marquee-row">
              {[...FEATURES, ...FEATURES].map((f, i) => (
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

        {/* ============================================================ */}
        {/* PICK YOUR DEVICE                                             */}
        {/* ============================================================ */}

        <div className="relative border-t border-border/60 dark:border-white/[0.06]">

          <div className="mx-auto max-w-2xl px-6 py-14 sm:px-10 sm:py-20">

            <div className="text-center">

              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Pick your device
              </h2>

              <p className="mt-2 text-sm text-muted-foreground">
                Android, iPhone or computer — choose yours to see how to get
                started.
              </p>

            </div>

            {/* ====================================================== */}
            {/* DEVICE BUTTONS                                          */}
            {/* ====================================================== */}

            <div className="mt-7 grid grid-cols-3 gap-2.5">

              {(
                [
                  {
                    value: "android",
                    label: "Android",
                    icon: AndroidIcon,
                  },
                  {
                    value: "ios",
                    label: "iOS",
                    icon: AppleIcon,
                  },
                  {
                    value: "desktop",
                    label: "Computer",
                    icon: DesktopIcon,
                  },
                ] as const
              ).map(({ value, label, icon: Icon }) => {

                const active = pick === value;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPick(value)}
                    className={cn(
                      "relative flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-xs font-medium transition-all duration-200",

                      active
                        ? "border-primary bg-primary/10 text-primary dark:border-primary/70 dark:bg-primary/15"
                        : "border-border bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-primary/50",
                    )}
                  >

                    {detected === value && (
                      <span
                        className="live-dot absolute right-2.5 top-2.5"
                        aria-hidden="true"
                      >
                        <span className="live-dot-ring" />
                        <span className="live-dot-ring live-dot-ring-2" />
                        <span className="live-dot-core" />
                      </span>
                    )}

                    <Icon className="size-6" />

                    {label}

                  </button>
                );
              })}

            </div>

            {/* ====================================================== */}
            {/* ACTIVE DEVICE PANEL                                    */}
            {/* ====================================================== */}

            <div className="mt-4 rounded-2xl border border-border bg-card p-5 text-center dark:border-white/10 dark:bg-white/[0.04] sm:p-6">

              <p className="text-sm font-semibold text-foreground">
                {activePanel.title}
              </p>

              <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
                {activePanel.body}
              </p>

              {activePanel.cta}

            </div>

            {/* ====================================================== */}
            {/* VERSION                                                  */}
            {/* ====================================================== */}

            <p className="mt-8 text-center text-[11px] text-muted-foreground/70">
              Android app version {APP_VERSION} · {ANDROID_PACKAGE}
            </p>

          </div>
        </div>

      </div>
    </div>
  );
}