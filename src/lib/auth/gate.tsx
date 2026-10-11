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
import { LoadingScreen } from "@/components/LoadingScreen";
import { WaveLines } from "@/components/WaveLines";
import { ConnectionLostScreen } from "@/components/ConnectionLostScreen";
import {
  friendlyNetworkMessage,
  isNetworkError,
  reportNetworkError,
  reportSuccess,
} from "@/lib/connection";
import { AccessRequestDialog } from "@/components/AccessRequestDialog";
import { ForgotPasswordDialog } from "@/components/ForgotPasswordDialog";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandWordmark } from "@/components/BrandWordmark";
import { LoginIllustration } from "@/components/LoginIllustration";
import { supabase } from "@/integrations/supabase/client";
import { DEVICE_TOKEN_KEY } from "@/lib/auth/identity";
import { lock } from "@/lib/auth/lock";
import { signInFn } from "@/lib/api/auth.functions";
import { passwordProblem } from "@/lib/auth/password";
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
/* Small page animations                                              */
/* ------------------------------------------------------------------ */

const PAGE_CSS = `
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
  }
}
`;

/**
 * Where this user should be instead of `pathname`, or null if they are already
 * on a screen meant for them.
 */
function redirectFor(
  me: Me | null,
  business: SessionState["business"],
  pathname: string,
): string | null {
  if (!me) return null;

  if (me.role === "worker") {
    return pathname !== "/worker" ? "/worker" : null;
  }

  if (me.role === "super_admin") {
    return pathname.startsWith("/platform/") ? null : "/platform/businesses";
  }

  if (pathname.startsWith("/platform/")) return "/dashboard";

  const feature = featureForPath(pathname);
  if (feature && !isFeatureEnabled(business, feature.key)) return "/dashboard";

  return null;
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
          <BrandWordmark className="h-5" />
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

  // The page that is actually on screen. `location` already points at the NEXT page
  // while a navigation is still loading, which let the old page (the normal dashboard)
  // show for a moment after sign-in; `resolvedLocation` only moves once the new page is ready.
  const pathname = useRouterState({
    select: (state) =>
      (state.resolvedLocation ?? state.location).pathname,
  });

  const [phase, setPhase] = useState<
    "loading" | "signed-out" | "ready" | "offline"
  >("loading");

  const [state, setState] =
    useState<SessionState>(EMPTY);

  const stateKey = useRef("");

  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  // Green message on the sign-in page (e.g. after a password was changed).
  const [notice, setNotice] = useState("");
  // Bumped by "Try again" to run the first session restore once more.
  const [restoreTick, setRestoreTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] =
    useState(false);

  // "Continue with Google" — sends the person to Google; /auth/google finishes the sign-in.
  const [googleBusy, setGoogleBusy] = useState(false);
  const signInWithGoogle = async () => {
    setErr("");
    setNotice("");
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErr("No internet connection. Check your network and try again.");
      return;
    }
    setGoogleBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/google`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setGoogleBusy(false);
      setErr("Unable to start Google sign-in. Please try again.");
    }
  };

  // "Forgot password?" — explains how to get a reset link from the admin.
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

  /* ---------- "last seen" heartbeat ---------- */
  // While the app is open and visible, tell the server every minute that this
  // user is here. The platform admin's Users page reads it as "Active now" /
  // "Last seen ...". Fire-and-forget: a failed ping must never disturb the app.
  const seenWorkerId = state.me?.workerId;
  useEffect(() => {
    if (phase !== "ready" || !seenWorkerId) return;

    const ping = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.rpc("touch_last_seen").then(
        () => undefined,
        () => undefined,
      );
    };

    ping();
    const interval = window.setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    window.addEventListener("focus", ping);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", ping);
      window.removeEventListener("focus", ping);
    };
  }, [phase, seenWorkerId]);

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
          } else if (res.reason === "error" && isNetworkError(res.message)) {
            // No internet / server unreachable: stay signed in and offer "Try again".
            reportNetworkError();
            setPhase("offline");
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
        reportSuccess();
      } catch (error) {
        console.warn(
          "Unable to restore the previous session",
          error,
        );

        if (mounted) {
          if (isNetworkError(error)) {
            reportNetworkError();
            setPhase("offline");
          } else {
            setPhase("signed-out");
          }
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [applyState, signOutWith, restoreTick]);

  // "Try again" on the connection screen, and the banner's Retry / auto-reconnect.
  useEffect(() => {
    const onRetry = () => {
      if (phase === "offline") {
        setPhase("loading");
        setRestoreTick((t) => t + 1);
      }
    };
    window.addEventListener("mbs-retry", onRetry);
    return () => window.removeEventListener("mbs-retry", onRetry);
  }, [phase]);

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
          if (res.reason === "error" && isNetworkError(res.message)) {
            reportNetworkError();
            return;
          }

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

        reportSuccess();

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

    // Light-touch: every minute while the tab is visible, plus when the tab
    // regains focus (throttled). Each check is 3 round-trips, so polling it
    // every 10s was a constant drag on the network and the UI.
    let lastCheck = Date.now();

    const run = () => {
      lastCheck = Date.now();
      void check();
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, 60_000);

    const onFocus = () => {
      if (Date.now() - lastCheck > 15_000) run();
    };

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

  // Decided during render (not in an effect) so a worker / platform admin never
  // sees a frame of the wrong screen: while a redirect is pending we render a
  // neutral splash instead of the app, then land straight on the right page.
  const redirectTo =
    phase === "ready"
      ? redirectFor(state.me, state.business, pathname)
      : null;

  useEffect(() => {
    if (!redirectTo) return;

    void navigate({
      to: redirectTo as never,
      replace: true,
    });
  }, [navigate, redirectTo]);

  /* ---------- sign in ---------- */

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    setErr("");
    setNotice("");

    const identifier = u.trim();

    if (!identifier || !p) {
      setErr(
        "Enter your mobile number, email or username, and your password",
      );

      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErr("No internet connection. Check your network and try again.");
      return;
    }

    setBusy(true);

    try {
      // Sign-in happens on the server: it checks the name and password, enforces the
      // one-device rule and returns a session (see signInFn).
      const attempt = (takeover: boolean) =>
        signInFn({
          data: {
            identifier,
            password: p,
            deviceToken: localStorage.getItem(DEVICE_TOKEN_KEY),
            takeover,
          },
        });

      let result;

      try {
        result = await attempt(false);

        if (result.status === "needs_takeover") {
          const takeOver = await confirmTakeover();

          if (!takeOver) return;

          result = await attempt(true);
        }
      } catch (error) {
        setErr(
          friendlyNetworkMessage(error) ??
            "Unable to sign in right now. Please try again.",
        );

        return;
      }

      if (result.status !== "ok") {
        setErr(
          result.status === "error"
            ? result.message
            : "Unable to sign in right now. Please try again.",
        );

        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });

      if (sessionError) {
        setErr("Unable to sign in right now. Please try again.");

        return;
      }

      if (result.deviceToken) {
        localStorage.setItem(DEVICE_TOKEN_KEY, result.deviceToken);
      }

      const res = await loadSessionState();

      if (!res.ok) {
        await supabase.auth.signOut();

        setErr(
          friendlyNetworkMessage(res.message) ||
            res.message ||
            "Unable to sign in",
        );

        return;
      }

      const next = res.state;
      const me = next.me!;

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

  /* ---------- sign-in / first-password screens are always light ---------- */

  // Dark mode only applies inside the app. While the person is signed out (or choosing
  // their first password) the <html> "dark" flag is removed, and the saved theme is put
  // back as soon as they are in.
  const forceLight =
    phase === "signed-out" || (phase === "ready" && !!state.me?.mustSetPassword);

  useEffect(() => {
    if (!forceLight) return;
    const root = document.documentElement;
    root.classList.remove("dark");
    const previousScheme = root.style.colorScheme;
    root.style.colorScheme = "light";
    return () => {
      root.style.colorScheme = previousScheme;
      try {
        if (localStorage.getItem("mbs-theme") === "dark") root.classList.add("dark");
      } catch {
        /* storage unavailable: stay light */
      }
    };
  }, [forceLight]);

  /* ---------- first sign-in: choose your own password ---------- */

  const submitNewPassword = async (
    e: FormEvent,
  ) => {
    e.preventDefault();

    setNewPasswordErr("");

    const password =
      newPassword.trim();

    const problem = passwordProblem(password);

    if (problem) {
      setNewPasswordErr(problem);

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

      // Password saved. The link only resets the password: clear the flag, end this
      // temporary session and send the person to the sign-in page to use the new password.
      const { error: clearError } = await supabase.rpc("clear_must_set_password");
      if (clearError) throw clearError;

      setNewPassword("");
      setNewPasswordConfirm("");

      localStorage.removeItem(DEVICE_TOKEN_KEY);
      applyState(EMPTY);
      await Promise.allSettled([unregisterNativePush(), stopNativeLocation()]);
      await supabase.auth.signOut();

      setErr("");
      setU("");
      setP("");
      setNotice("Password changed successfully. Sign in with your new password.");
      setPhase("signed-out");
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

  if (phase === "offline") {
    return (
      <ConnectionLostScreen
        onRetry={() => {
          setPhase("loading");
          setRestoreTick((t) => t + 1);
        }}
      />
    );
  }

  if (phase === "loading") {
    return <LoadingScreen title="Loading…" subtitle="Please wait a moment" />;
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
            Choose a password for your account to
            continue. Use at least 8 characters with
            letters and numbers.
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
              placeholder="New password (min. 8 characters, letters and numbers)"
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
    if (redirectTo) {
      return (
        <LoadingScreen
          title="Loading your account…"
          subtitle="Please wait, this will only take a moment"
        />
      );
    }

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

      {busy && !takeoverOpen && (
        <LoadingScreen
          overlay
          title="Signing you in…"
          subtitle="Loading your account, please wait"
        />
      )}

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

      <div className="relative z-10 flex w-full max-w-[420px] flex-col overflow-hidden rounded-[2rem] bg-card shadow-[0_24px_70px_-12px_rgb(16_48_92/18%)] ring-1 ring-black/5 dark:bg-[#141f16] dark:shadow-[0_24px_70px_-12px_rgb(0_0_0/65%)] dark:ring-1 dark:ring-white/10 md:max-w-[460px] split:max-w-[1000px] split:flex-row">

        {/* ======================================================== */}
        {/* ILLUSTRATION PANEL                                        */}
        {/* ======================================================== */}

        <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#7ab558] via-primary to-[#22331c] split:flex split:w-[46%] split:items-center split:justify-center">

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

        <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden px-6 py-10 sm:px-10 md:px-12 split:px-12 split:py-10">

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

              <BrandWordmark className="h-5" />
            </div>

            {/* Mobile illustration */}

            <div className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-[#eaf3e2] to-[#dbe9cd] dark:from-[#1c2c20] dark:to-[#12201a] dark:ring-1 dark:ring-white/10 split:hidden">
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

              {notice && !err && (
                <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                  {notice}
                </p>
              )}

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
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Please wait…
                  </span>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>

            {/* Google sign-in (for accounts the admin saved an email on) */}

            <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={busy || googleBusy}
              onClick={signInWithGoogle}
              className="mt-5 h-12 w-full rounded-full text-sm font-semibold"
            >
              {googleBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <svg viewBox="0 0 48 48" className="mr-2 h-4 w-4" aria-hidden>
                    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
                    <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
                    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
                  </svg>
                  Continue with Google
                </>
              )}
            </Button>

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