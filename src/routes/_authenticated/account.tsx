import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Crown,
  Eye,
  EyeOff,
  HardHat,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  MailCheck,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { useSession } from "@/lib/auth/session";
import { lock } from "@/lib/auth/lock";
import { passwordProblem } from "@/lib/auth/password";
import {
  confirmAccountOtpFn,
  requestAccountOtpFn,
  verifyAccountOtpFn,
} from "@/lib/api/forgot-password.functions";

/**
 * "Manage my account" as a full page (the phone's "More" menu opens this instead of a pop-up).
 *
 *   Works for admins, managers, workers and the platform admin.
 *   home      who you are, Change password, Sign out
 *   change    current password + new password
 *   code      "Forgot password?" -> a 6-digit code is emailed to the email saved on THIS account
 *   reset     code accepted -> choose a new password (you are then signed out to sign in again)
 */
export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

const ROLE_DISPLAY = {
  worker: { label: "Worker", icon: HardHat, className: "bg-primary/10 text-primary" },
  manager: { label: "Manager", icon: Shield, className: "bg-primary/10 text-primary" },
  admin: { label: "Admin", icon: Crown, className: "bg-amber-500/10 text-amber-600" },
  super_admin: { label: "Platform admin", icon: Crown, className: "bg-amber-500/10 text-amber-600" },
} as const;

type View = "home" | "change" | "code" | "reset";

const messageOf = (e: unknown) =>
  e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.";

function AccountPage() {
  const { me, business } = useSession();
  const navigate = useNavigate();
  const router = useRouter();

  const [view, setView] = useState<View>("home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  // change password
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  // forgot password (email code)
  const [code, setCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  if (!me) return null;

  const roleInfo = ROLE_DISPLAY[me.role as keyof typeof ROLE_DISPLAY] ?? null;
  const RoleIcon = roleInfo?.icon;

  const clearFields = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setCode("");
    setError("");
    setShowPw(false);
  };

  const goBack = () => {
    if (view === "home") {
      if (window.history.length > 1) router.history.back();
      else void navigate({ to: (me.role === "worker" ? "/worker" : "/dashboard") as never });
      return;
    }
    clearFields();
    setView(view === "reset" ? "code" : view === "code" ? "change" : "home");
  };

  const inputClass = "h-12 rounded-xl text-base";
  const primaryBtn = "h-12 w-full rounded-xl text-base font-semibold";

  /* ---------------- change password (knows the current one) ---------------- */
  const saveChange = async () => {
    setError("");
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) throw new Error("No account found for this session");
      const problem = passwordProblem(next);
      if (problem) throw new Error(problem);
      if (next !== confirm) throw new Error("New passwords do not match");
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (verifyError) throw new Error("Current password is incorrect");
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;
      toast.success("Password changed successfully");
      clearFields();
      setView("home");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- forgot password (email code) ---------------- */
  const sendCode = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await requestAccountOtpFn();
      setMaskedEmail(res.email);
      setCode("");
      setCooldown(60);
      setView("code");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await requestAccountOtpFn();
      setMaskedEmail(res.email);
      setCode("");
      setCooldown(60);
      toast.success("A new code is on its way");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (value: string = code) => {
    if (busy) return;
    if (value.length !== 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await verifyAccountOtpFn({ data: { code: value } });
      setView("reset");
      setNext("");
      setConfirm("");
    } catch (e) {
      setError(messageOf(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    const problem = passwordProblem(next);
    if (problem) return setError(problem);
    if (next !== confirm) return setError("The two passwords don't match");
    setBusy(true);
    setError("");
    try {
      await confirmAccountOtpFn({ data: { code, newPassword: next } });
      toast.success("Password changed. Sign in with your new password.");
      // The server signs every device of this account out after a reset, so sign out here too.
      lock();
    } catch (e) {
      const message = messageOf(e);
      if (/code is incorrect or has expired/i.test(message)) {
        setView("code");
        setCode("");
        setNext("");
        setConfirm("");
      }
      setError(message);
      setBusy(false);
    }
  };

  const title =
    view === "home"
      ? "Manage my account"
      : view === "change"
        ? "Change password"
        : view === "code"
          ? "Enter your code"
          : "Choose a new password";

  return (
    <div className="mx-auto w-full max-w-md pb-6">
      {/* Top bar with Back */}
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted/60 active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">{title}</h1>
      </div>

      {/* Profile card */}
      <div className="mb-5 flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
          {(me.name || "?")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase())
            .join("")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold leading-tight">{me.name}</div>
          {business?.name && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{business.name}</span>
            </div>
          )}
          {roleInfo && RoleIcon && (
            <span
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${roleInfo.className}`}
            >
              <RoleIcon className="h-3 w-3" /> {roleInfo.label}
            </span>
          )}
        </div>
      </div>

      {/* ---------------- HOME ---------------- */}
      {view === "home" && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Security</p>
            <button
              type="button"
              onClick={() => {
                clearFields();
                setView("change");
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.99]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <KeyRound className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Change password</span>
                <span className="block text-xs text-muted-foreground">Update the password you sign in with</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </div>

          <div className="border-t border-border pt-4">
            <ConfirmDelete
              onConfirm={lock}
              title="Sign out of this account?"
              description={
                me.role === "worker"
                  ? "You will need to sign in again to view attendance and payment records."
                  : "You will need to sign in again to access the dashboard."
              }
              confirmLabel="Sign out"
            >
              <Button
                variant="outline"
                className="h-12 w-full justify-center gap-2 rounded-xl border-destructive/40 font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </ConfirmDelete>
          </div>
        </div>
      )}

      {/* ---------------- CHANGE PASSWORD ---------------- */}
      {view === "change" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveChange();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Enter your current password and the new password you want to use.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="acc-current">Current password</Label>
            <Input
              id="acc-current"
              type={showPw ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className={inputClass}
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => {
                setError("");
                void sendCode();
              }}
              disabled={busy}
              className="pt-1 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
            >
              Forgot password?
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-new">New password</Label>
            <div className="relative">
              <Input
                id="acc-new"
                type={showPw ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                className={`${inputClass} pr-12`}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPw ? "Hide passwords" : "Show passwords"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-confirm">Confirm new password</Label>
            <Input
              id="acc-confirm"
              type={showPw ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
              disabled={busy}
            />
          </div>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          <Button type="submit" className={primaryBtn} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </form>
      )}

      {/* ---------------- EMAIL CODE ---------------- */}
      {view === "code" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verifyCode();
          }}
        >
          <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-3 text-sm text-muted-foreground">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>
              We sent a 6-digit code to{" "}
              <span className="font-semibold text-foreground">{maskedEmail || "your email"}</span>. It works for 10
              minutes. Check your spam folder too.
            </p>
          </div>
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(v) => setCode(v.replace(/\D/g, ""))}
            onComplete={(v) => void verifyCode(v)}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            autoFocus
            disabled={busy}
            containerClassName="w-full justify-between gap-2"
          >
            <InputOTPGroup className="w-full justify-between gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="aspect-[4/5] h-auto min-w-0 flex-1 rounded-xl border border-input bg-background text-2xl font-semibold shadow-none first:rounded-xl first:border-l last:rounded-xl data-[active=true]:border-primary"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className={primaryBtn} disabled={busy || code.length !== 6}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify code"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full rounded-xl text-sm font-semibold"
            onClick={resend}
            disabled={busy || cooldown > 0}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </Button>
        </form>
      )}

      {/* ---------------- NEW PASSWORD (after the code) ---------------- */}
      {view === "reset" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void resetPassword();
          }}
        >
          <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-3 text-sm text-muted-foreground">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>Code accepted. Choose a new password. You will be signed out and can sign in with it.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-reset-new">New password</Label>
            <div className="relative">
              <Input
                id="acc-reset-new"
                type={showPw ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                autoFocus
                className={`${inputClass} pr-12`}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPw ? "Hide passwords" : "Show passwords"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-reset-confirm">Confirm new password</Label>
            <Input
              id="acc-reset-confirm"
              type={showPw ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
              disabled={busy}
            />
          </div>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          <Button type="submit" className={primaryBtn} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Change password"}
          </Button>
        </form>
      )}
    </div>
  );
}