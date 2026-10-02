import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AccessRequestDialog } from "@/components/AccessRequestDialog";
import { ForgotPasswordDialog } from "@/components/ForgotPasswordDialog";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandName } from "@/components/BrandName";
import { LoginIllustration } from "@/components/LoginIllustration";
import { supabase } from "@/integrations/supabase/client";
import { DEVICE_TOKEN_KEY } from "@/lib/auth/identity";
import { resolveLoginFn } from "@/lib/api/auth.functions";
import { PLATFORM_TAGLINE } from "@/lib/brand";
import { registerNativePush, unregisterNativePush } from "@/lib/native-push";
import { stopNativeLocation } from "@/lib/native-location";
import {
  SessionContext,
  loadSessionState,
  setSessionSnapshot,
  type Me,
  type SessionState,
} from "@/lib/auth/session";
import { featureForPath, isFeatureEnabled } from "@/lib/features";
import type { RequestType } from "@/lib/access-requests";

const EMPTY: SessionState = {
  me: null,
  business: null,
};

const inputClass =
  "h-12 rounded-full border-border bg-background px-5 text-sm shadow-none dark:border-white/15 dark:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-primary/40";

/* ------------------------------------------------------------------ */
/* Flowing wave-line background                                       */
/* ------------------------------------------------------------------ */

function WaveLines({
  className,
}: {
  className?: string;
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
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Small page animations                                              */
/* ------------------------------------------------------------------ */

const PAGE_CSS = `
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
  }
}
`;

/** Signs out, forgets this device's token and reloads. */
export function lock() {
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  setSessionSnapshot(EMPTY);
  // Stop phone notifications for this account first (needs the session, so before sign-out).
  // Same for background location: stop the phone's tracking service and revoke its token.
  void Promise.allSettled([unregisterNativePush(), stopNativeLocation()])
    .then(() => supabase.auth.signOut())
    .finally(() => window.location.reload());
}

/** One signed-in device per staff/worker account (the platform admin has no such limit). */
function isThisDevice(me: Me) {
  if (!me.workerId) return true;

  const local = localStorage.getItem(DEVICE_TOKEN_KEY);

  return Boolean(me.sessionToken) && me.sessionToken === local;
}

/* ------------------------------------------------------------------ */
/* Password / session card                                            */
/* ------------------------------------------------------------------ */

function CardShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#eef6e6] px-4 py-6 sm:px-6 dark:bg-[#0a130d]">
      {/* Full page wave background */}
      <WaveLines
        className="
          pointer-events-none
          absolute
          inset-0
          z-0
          h-full
          w-full
          text-[#5d8749]
          opacity-40
          dark:text-[#d9f5c0]
          dark:opacity-30
        "
      />

      {/* Background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 z-0 h-80 w-80 rounded-full bg-[#7ab558]/20 blur-[100px]"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 z-0 h-80 w-80 rounded-full bg-[#7ab558]/15 blur-[100px]"
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-[2rem] border border-border/60 bg-card p-7 shadow-[0_20px_60px_rgb(16_48_92/12%)] dark:border-white/10 dark:bg-[#152219] dark:shadow-[0_20px_70px_rgb(0_0_0/60%)] dark:ring-1 dark:ring-white/5 sm:p-9">
        <div className="mb-7 flex items-center gap-2">
          <BrandLogo className="h-9 w-9" />
          <BrandName className="text-lg font-bold tracking-tight" />
        </div>

        {children}
      </div>
    </div>
  );
}

export function Gate({
  children,
}: {
  children: ReactNode;
}) {
  const navigate = useNavigate();

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const [phase, setPhase] = useState<
    "loading" | "signed-out" | "ready"
  >("loading");

  const [state, setState] =
    useState<SessionState>(EMPTY);

  const stateKey = useRef("");

  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] =
    useState(false);

  // "Forgot password?" — username/email + last 4 digits of mobile number.
  const [forgotOpen, setForgotOpen] = useState(false);

  // "Need access? Contact your admin" — the request form.
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessType, setAccessType] =
    useState<RequestType>("app_access");

  // "Already signed in on another device?" confirmation (replaces window.confirm).
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const takeoverResolveRef = useRef<
    ((value: boolean) => void) | null
  >(null);

  const confirmTakeover = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      takeoverResolveRef.current = resolve;
      setTakeoverOpen(true);
    });
  }, []);

  const resolveTakeover = useCallback(
    (result: boolean) => {
      setTakeoverOpen(false);
      takeoverResolveRef.current?.(result);
      takeoverResolveRef.current = null;
    },
    [],
  );

  // First-sign-in "choose your own password" step.
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] =
    useState("");
  const [newPasswordErr, setNewPasswordErr] =
    useState("");
  const [savingNewPassword, setSavingNewPassword] =
    useState(false);

  const applyState = useCallback(
    (next: SessionState) => {
      stateKey.current = JSON.stringify(next);
      setSessionSnapshot(next);
      setState(next);
    },
    [],
  );

  const signOutWith = useCallback(
    async (message: string) => {
      localStorage.removeItem(DEVICE_TOKEN_KEY);
      applyState(EMPTY);
      setErr(message);
      setPhase("signed-out");

      await Promise.allSettled([unregisterNativePush(), stopNativeLocation()]);
      await supabase.auth.signOut();
    },
    [applyState],
  );

  /* ---------- phone notifications (native Android app only) ---------- */
  // Once anyone is signed in (admin, manager or worker), register this phone so alerts reach
  // the notification center even when the app is closed. What each role receives is decided
  // by the send-push Edge Function (admin: everything, manager: rentals, worker: own attendance).
  const pushUserId = state.me?.userId;
  const pushRole = state.me?.role;
  useEffect(() => {
    if (phase !== "ready" || !pushUserId) return;
    if (pushRole !== "admin" && pushRole !== "manager" && pushRole !== "worker") return;
    void registerNativePush();
  }, [phase, pushUserId, pushRole]);

  /* ---------- restore an existing session on load ---------- */

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const res = await Promise.race([
          loadSessionState(),
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () => reject(new Error("timeout")),
              12000,
            ),
          ),
        ]);

        if (!mounted) return;

        if (!res.ok) {
          if (res.reason === "inactive") {
            await signOutWith(res.message);
          } else {
            if (res.reason === "error") {
              setErr(res.message);
            }

            setPhase("signed-out");
          }

          return;
        }

        if (!isThisDevice(res.state.me!)) {
          await signOutWith(
            "Your account was signed in on another device",
          );

          return;
        }

        applyState(res.state);
        setPhase("ready");
      } catch (error) {
        console.warn(
          "Unable to restore the previous session",
          error,
        );

        if (mounted) {
          setPhase("signed-out");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [applyState, signOutWith]);

  /* ---------- keep the session honest while the app is open ---------- */

  useEffect(() => {
    if (phase !== "ready") return;

    let checking = false;

    const check = async () => {
      if (checking) return;

      checking = true;

      try {
        const res = await loadSessionState();

        if (!res.ok) {
          if (
            res.reason === "inactive" ||
            res.reason === "no-session"
          ) {
            await signOutWith(
              res.message || "Please sign in again",
            );
          }

          return;
        }

        if (!isThisDevice(res.state.me!)) {
          await signOutWith(
            "Your account was signed in on another device",
          );

          return;
        }

        const previous = stateKey.current
          ? (JSON.parse(
              stateKey.current,
            ) as SessionState)
          : EMPTY;

        if (
          previous.me?.role !== res.state.me?.role ||
          previous.business?.id !==
            res.state.business?.id
        ) {
          window.location.reload();
          return;
        }

        if (
          JSON.stringify(res.state) !==
          stateKey.current
        ) {
          applyState(res.state);
        }
      } finally {
        checking = false;
      }
    };

    const interval = window.setInterval(
      () => void check(),
      10000,
    );

    const onFocus = () => void check();

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(
        "focus",
        onFocus,
      );
    };
  }, [phase, applyState, signOutWith]);

  /* ---------- keep each kind of user on the screens meant for them ---------- */

  useEffect(() => {
    if (phase !== "ready" || !state.me) return;

    const role = state.me.role;

    if (
      role === "worker" &&
      pathname !== "/worker"
    ) {
      void navigate({
        to: "/worker",
      });
    } else if (
      role === "super_admin" &&
      !pathname.startsWith("/platform/")
    ) {
      void navigate({
        to: "/platform/businesses",
      });
    } else if (
      role !== "super_admin" &&
      role !== "worker" &&
      pathname.startsWith("/platform/")
    ) {
      void navigate({
        to: "/dashboard",
      });
    } else if (
      role !== "super_admin" &&
      role !== "worker"
    ) {
      const feature = featureForPath(pathname);

      if (
        feature &&
        !isFeatureEnabled(
          state.business,
          feature.key,
        )
      ) {
        void navigate({
          to: "/dashboard",
        });
      }
    }
  }, [
    navigate,
    pathname,
    phase,
    state,
  ]);

  /* ---------- sign in ---------- */

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    setErr("");

    const identifier = u.trim();

    if (!identifier || !p) {
      setErr(
        "Enter your mobile number, email or username, and your password",
      );

      return;
    }

    setBusy(true);

    try {
      let loginEmail: string;

      try {
        loginEmail = (
          await resolveLoginFn({
            data: {
              identifier,
            },
          })
        ).email;
      } catch {
        setErr(
          "Unable to sign in right now. Please try again.",
        );

        return;
      }

      const { error } =
        await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: p,
        });

      if (error) {
        setErr(
          /banned|deactivated/i.test(
            error.message,
          )
            ? "This account is deactivated"
            : "Invalid credentials",
        );

        return;
      }

      const res = await loadSessionState();

      if (!res.ok) {
        await supabase.auth.signOut();

        setErr(
          res.message || "Unable to sign in",
        );

        return;
      }

      let next = res.state;
      const me = next.me!;

      if (me.workerId) {
        const local = localStorage.getItem(
          DEVICE_TOKEN_KEY,
        );

        if (
          me.sessionToken &&
          me.sessionToken !== local
        ) {
          const takeOver = await confirmTakeover();

          if (!takeOver) {
            await supabase.auth.signOut();
            return;
          }
        }

        const token = crypto.randomUUID();

        const { error: claimError } =
          await supabase.rpc(
            "claim_device",
            {
              p_token: token,
            },
          );

        if (claimError) {
          await supabase.auth.signOut();

          setErr(
            "Unable to start your device session",
          );

          return;
        }

        localStorage.setItem(
          DEVICE_TOKEN_KEY,
          token,
        );

        next = {
          ...next,
          me: {
            ...me,
            sessionToken: token,
          },
        };
      }

      applyState(next);
      setPhase("ready");
      setP("");

      const destination =
        me.role === "worker"
          ? "/worker"
          : me.role === "super_admin"
            ? "/platform/businesses"
            : "/dashboard";

      void navigate({
        to: destination,
        replace: true,
      });
    } finally {
      setBusy(false);
    }
  };

  /* ---------- first sign-in: choose your own password ---------- */

  const submitNewPassword = async (
    e: FormEvent,
  ) => {
    e.preventDefault();

    setNewPasswordErr("");

    const password =
      newPassword.trim();

    if (password.length < 6) {
      setNewPasswordErr(
        "Password must be at least 6 characters",
      );

      return;
    }

    if (
      password !==
      newPasswordConfirm.trim()
    ) {
      setNewPasswordErr(
        "Passwords do not match",
      );

      return;
    }

    setSavingNewPassword(true);

    try {
      const { error } =
        await supabase.auth.updateUser({
          password,
        });

      if (error) throw error;

      const {
        error: clearError,
      } = await supabase.rpc(
        "clear_must_set_password",
      );

      if (clearError) throw clearError;

      if (state.me) {
        applyState({
          ...state,
          me: {
            ...state.me,
            mustSetPassword: false,
          },
        });
      }

      setNewPassword("");
      setNewPasswordConfirm("");
    } catch (error) {
      setNewPasswordErr(
        error instanceof Error
          ? error.message
          : "Unable to set password",
      );
    } finally {
      setSavingNewPassword(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Loading screen                                                   */
  /* ---------------------------------------------------------------- */

  if (phase === "loading") {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-3 overflow-hidden bg-background p-4 text-sm text-muted-foreground">
        <WaveLines
          className="
            pointer-events-none
            absolute
            inset-0
            h-full
            w-full
            text-foreground
            opacity-20
          "
        />

        <div className="relative z-10 flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />

          <span>Loading...</span>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* First password setup                                             */
  /* ---------------------------------------------------------------- */

  if (
    phase === "ready" &&
    state.me?.mustSetPassword
  ) {
    return (
      <>
        <style>{PAGE_CSS}</style>

        <CardShell>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Welcome, {state.me.name}
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Set a password for your account to
            continue. You won't need to use your
            mobile number as your password again.
          </p>

          <form
            onSubmit={submitNewPassword}
            className="mt-7 space-y-4"
          >
            <Input
              type="password"
              value={newPassword}
              onChange={(e) =>
                setNewPassword(e.target.value)
              }
              autoComplete="new-password"
              autoFocus
              placeholder="New password (min. 6 characters)"
              className={inputClass}
            />

            <Input
              type="password"
              value={newPasswordConfirm}
              onChange={(e) =>
                setNewPasswordConfirm(
                  e.target.value,
                )
              }
              autoComplete="new-password"
              placeholder="Confirm new password"
              className={inputClass}
            />

            {newPasswordErr && (
              <p className="text-xs font-medium text-destructive">
                {newPasswordErr}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1 rounded-full"
                onClick={lock}
              >
                Sign out
              </Button>

              <Button
                type="submit"
                className="h-12 flex-1 rounded-full font-semibold"
                disabled={
                  savingNewPassword
                }
              >
                {savingNewPassword
                  ? "Saving…"
                  : "Continue"}
              </Button>
            </div>
          </form>
        </CardShell>
      </>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Signed-in application                                            */
  /* ---------------------------------------------------------------- */

  if (phase === "ready") {
    return (
      <SessionContext.Provider value={state}>
        {children}
      </SessionContext.Provider>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Main login page                                                  */
  /* ---------------------------------------------------------------- */

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#eef6e6] px-4 py-6 sm:px-6 md:py-10 dark:bg-[#0a130d]">
      <style>{PAGE_CSS}</style>

      {/* ============================================================ */}
      {/* FULL PAGE WAVE LINES                                        */}
      {/* ============================================================ */}

      <WaveLines
        className="
          pointer-events-none
          absolute
          inset-0
          z-0
          h-full
          w-full
          text-[#5d8749]
          opacity-45
          dark:text-[#d9f5c0]
          dark:opacity-30
        "
      />

      {/* Background green glow */}

      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 z-0 h-[28rem] w-[28rem] rounded-full bg-[#7ab558]/20 blur-[110px]"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-40 z-0 h-[30rem] w-[30rem] rounded-full bg-[#7ab558]/15 blur-[110px]"
      />

      {/* ============================================================ */}
      {/* MAIN LOGIN CARD                                              */}
      {/* ============================================================ */}

      <div className="relative z-10 flex w-full max-w-[420px] flex-col overflow-hidden rounded-[2rem] bg-card shadow-[0_24px_70px_-12px_rgb(16_48_92/18%)] ring-1 ring-black/5 dark:bg-[#141f16] dark:shadow-[0_24px_70px_-12px_rgb(0_0_0/65%)] dark:ring-1 dark:ring-white/10 md:max-w-[460px] lg:max-w-[1000px] lg:flex-row">

        {/* ======================================================== */}
        {/* ILLUSTRATION PANEL                                        */}
        {/* ======================================================== */}

        <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#7ab558] via-primary to-[#22331c] lg:flex lg:w-[46%] lg:items-center lg:justify-center">

          {/* Green panel wave lines */}

          <WaveLines
            className="
              pointer-events-none
              absolute
              inset-0
              z-0
              h-full
              w-full
              text-white
              opacity-45
            "
          />

          {/* Panel glow */}

          <div
            aria-hidden
            className="pointer-events-none absolute -left-16 -top-16 z-0 h-64 w-64 rounded-full bg-white/15 blur-3xl"
          />

          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -right-10 z-0 h-72 w-72 rounded-full bg-black/20 blur-3xl"
          />

          <div
            aria-hidden
            className="pointer-events-none absolute right-10 top-10 z-0 h-24 w-24 rounded-full bg-[#c8e896]/25 blur-2xl"
          />

          {/* Illustration content */}

          <div className="relative z-10 flex flex-col items-center gap-8">

            <div className="rounded-[2.5rem] bg-white/10 p-8 backdrop-blur-sm">
              <LoginIllustration className="h-56 w-56 drop-shadow-2xl" />
            </div>

            <div className="text-center text-white/90">
              <p className="text-lg font-semibold">
                Track every rental. Grow every day.
              </p>

              <p className="mt-1 text-sm text-white/60">
                {PLATFORM_TAGLINE}
              </p>
            </div>

          </div>
        </div>

        {/* ======================================================== */}
        {/* FORM PANEL                                                 */}
        {/* ======================================================== */}

        <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden px-6 py-10 sm:px-10 md:px-12 lg:px-14 lg:py-14">

          {/* Very subtle lines behind the form */}

          <WaveLines
            className="
              pointer-events-none
              absolute
              inset-0
              z-0
              h-full
              w-full
              text-foreground
              opacity-[0.035]
            "
          />

          <div className="relative z-10 w-full max-w-[360px]">

            {/* Logo */}

            <div className="mb-8 flex items-center gap-2.5">
              <BrandLogo className="h-10 w-10" />

              <BrandName className="text-lg font-bold tracking-tight" />
            </div>

            {/* Mobile illustration */}

            <div className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-[#eaf3e2] to-[#dbe9cd] dark:from-[#1c2c20] dark:to-[#12201a] dark:ring-1 dark:ring-white/10 lg:hidden">
              <LoginIllustration className="h-24 w-24" />
            </div>

            {/* Heading */}

            <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
              Welcome back
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to manage your records
            </p>

            {/* Login form */}

            <form
              onSubmit={submit}
              className="mt-8 space-y-3.5"
            >
              <Input
                id="gate-username"
                value={u}
                onChange={(e) =>
                  setU(e.target.value)
                }
                autoFocus
                autoComplete="username"
                inputMode="text"
                placeholder="Mobile number, email or username"
                className={inputClass}
              />

              <div className="relative">
                <Input
                  id="gate-password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={p}
                  onChange={(e) =>
                    setP(e.target.value)
                  }
                  autoComplete="current-password"
                  placeholder="Password"
                  className={`${inputClass} pr-12`}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (visible) =>
                        !visible,
                    )
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  className="absolute right-4 top-1/2 z-10 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {err && (
                <p className="text-xs font-medium text-destructive">
                  {err}
                </p>
              )}

              <div className="flex justify-end pb-2 pt-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setForgotOpen(true)
                  }
                  className="text-sm font-semibold text-primary transition-opacity hover:opacity-80 hover:underline focus-visible:outline-none focus-visible:underline"
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-full text-sm font-semibold shadow-md shadow-primary/20 transition-transform active:scale-[0.99]"
              >
                {busy
                  ? "Signing in…"
                  : "Sign in"}
              </Button>
            </form>

            {/* Contact admin */}

            <p className="mt-8 text-center text-sm text-muted-foreground">
              Need access?{" "}
              <button
                type="button"
                onClick={() => {
                  setAccessType("app_access");
                  setAccessOpen(true);
                }}
                className="font-semibold text-primary transition-opacity hover:opacity-80 hover:underline focus-visible:outline-none focus-visible:underline"
              >
                Contact your admin
              </button>
            </p>

          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* FORGOT PASSWORD                                               */}
      {/* ============================================================ */}

      <ForgotPasswordDialog
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        initialIdentifier={u}
        onDone={(identifier) => {
          setU(identifier);
          setP("");
          setErr("");
        }}
        onAskAdmin={() => {
          setForgotOpen(false);
          setAccessType("forgot_credentials");
          setAccessOpen(true);
        }}
      />

      {/* ============================================================ */}
      {/* NEED ACCESS — request form                                    */}
      {/* ============================================================ */}

      <AccessRequestDialog
        open={accessOpen}
        onOpenChange={setAccessOpen}
        defaultType={accessType}
      />

      {/* ============================================================ */}
      {/* ALREADY SIGNED IN ON ANOTHER DEVICE                           */}
      {/* ============================================================ */}

      <Dialog
        open={takeoverOpen}
        onOpenChange={(open) =>
          !open && resolveTakeover(false)
        }
      >
        <DialogContent className="max-w-[400px] rounded-[1.5rem] sm:p-7">
          <DialogHeader>
            <DialogTitle>
              Already signed in elsewhere
            </DialogTitle>

            <DialogDescription>
              This account is already signed in on
              another device. Log out that device
              and continue here?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full font-semibold"
              onClick={() =>
                resolveTakeover(false)
              }
            >
              Cancel
            </Button>

            <Button
              type="button"
              className="h-11 rounded-full font-semibold"
              onClick={() =>
                resolveTakeover(true)
              }
            >
              Log out & continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}