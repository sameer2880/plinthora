import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound, Loader2, LockKeyhole, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { AuthPageHeading, AuthPageLayout } from "@/components/AuthPageLayout";
import { confirmResetOtpFn, requestResetOtpFn, verifyResetOtpFn } from "@/lib/api/forgot-password.functions";
import { passwordProblem } from "@/lib/auth/password";
import { PLATFORM_NAME } from "@/lib/brand";

/**
 * "Forgot password?" as a full page (it used to be a pop-up card).
 *
 *   Step 1  type username / email / mobile  ->  a 6-digit code is emailed (if the account has an email saved)
 *   Step 2  type the code                   ->  checked by the server; only a correct code moves on
 *   Step 3  choose a new password           ->  password changed, sign in as usual
 *
 * The answer after step 1 is always the same, so it never reveals whether an account exists.
 * People with no email saved can still ask the admin from /request-access.
 */
export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [{ title: `Forgot password — ${PLATFORM_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"identify" | "code" | "password">("identify");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

  const goToSignIn = () => void navigate({ to: "/dashboard" as never, replace: true });
  const goToAdminRequest = () =>
    void navigate({ to: "/request-access" as never, search: { type: "forgot_credentials" } as never });

  const sendCode = async () => {
    if (!identifier.trim()) {
      setError("Enter your username, email or mobile number");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestResetOtpFn({ data: { identifier: identifier.trim() } });
      setStep("code");
      setCode("");
      setCooldown(60);
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
      await verifyResetOtpFn({ data: { identifier: identifier.trim(), code: value } });
      setStep("password");
    } catch (e) {
      setError(messageOf(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      await requestResetOtpFn({ data: { identifier: identifier.trim() } });
      setCode("");
      setCooldown(60);
      toast.success("If that account has an email saved, a new code is on its way");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await confirmResetOtpFn({ data: { identifier: identifier.trim(), code, newPassword: password } });
      toast.success("Password changed. Sign in with your new password.");
      goToSignIn();
    } catch (e) {
      const message = messageOf(e);
      if (/code is incorrect or has expired/i.test(message)) {
        // The code ran out (or was used up) while they were typing: ask for it again.
        setStep("code");
        setCode("");
        setPassword("");
        setConfirm("");
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const inputClass = "h-14 rounded-2xl border-border bg-background px-5 text-base shadow-none sm:h-12 sm:rounded-full sm:text-sm dark:border-white/15 dark:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-primary/40";
  const primaryBtn = "h-14 w-full rounded-2xl text-base font-semibold shadow-md shadow-primary/20 sm:h-12 sm:rounded-full sm:text-sm";
  const secondaryBtn = "h-14 w-full rounded-2xl text-base font-semibold sm:h-12 sm:rounded-full sm:text-sm";
  const stepIndex = step === "identify" ? 0 : step === "code" ? 1 : 2;

  return (
    <AuthPageLayout
      appBackground
      onBack={
        step === "identify"
          ? undefined
          : () => {
              setError("");
              setStep(step === "password" ? "code" : "identify");
            }
      }
      backLabel={step === "identify" ? "Back to sign in" : "Back"}
    >
      <div className="mb-5 flex items-center gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={stepIndex + 1} aria-label={`Step ${stepIndex + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-primary" : "bg-primary/15"}`} />
        ))}
      </div>
      <AuthPageHeading
        icon={
          step === "identify" ? (
            <KeyRound className="h-6 w-6" />
          ) : step === "code" ? (
            <MailCheck className="h-6 w-6" />
          ) : (
            <LockKeyhole className="h-6 w-6" />
          )
        }
        title={step === "identify" ? "Forgot your password?" : step === "code" ? "Enter your code" : "Choose a new password"}
        description={
          step === "identify"
            ? "Enter your username, email or mobile number. If your account has an email saved, we'll send a 6-digit code to it."
            : step === "code"
              ? "If that account has an email saved, a 6-digit code was sent to it. It works for 10 minutes."
              : "Code accepted. Now choose a new password for your account."
        }
      />

      {step === "identify" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="fp-identifier">Username, email or mobile</Label>
            <Input
              id="fp-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              className={inputClass}
              disabled={busy}
            />
          </div>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          <Button type="submit" className={primaryBtn} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code"}
          </Button>
          <Button type="button" variant="outline" className={secondaryBtn} onClick={goToAdminRequest} disabled={busy}>
            No email? Ask admin
          </Button>
        </form>
      ) : step === "code" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verifyCode();
          }}
        >
          <div className="space-y-2">
            <Label className="sr-only">6-digit code</Label>
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
              containerClassName="w-full justify-between gap-2 sm:gap-3"
            >
              <InputOTPGroup className="w-full justify-between gap-2 sm:gap-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="aspect-[4/5] h-auto min-w-0 flex-1 rounded-xl border border-input bg-background text-2xl font-semibold shadow-none first:rounded-xl first:border-l last:rounded-xl dark:border-white/15 dark:bg-white/[0.04] data-[active=true]:border-primary sm:max-w-14"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Code requested for <span className="font-semibold text-foreground">{identifier.trim()}</span>. Check your spam folder too.
          </p>
          {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive">{error}</p>}
          <Button type="submit" className={primaryBtn} disabled={busy || code.length !== 6}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify code"}
          </Button>
          <Button type="button" variant="ghost" className={`${secondaryBtn} h-12 sm:h-11`} onClick={resend} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep("identify");
              setError("");
            }}
            className="block w-full text-center text-xs font-semibold text-primary hover:underline"
            disabled={busy}
          >
            Use a different account
          </button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void reset();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="fp-password">New password</Label>
            <div className="relative">
              <Input
                id="fp-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                className={`${inputClass} pr-12`}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fp-confirm">Confirm new password</Label>
            <Input
              id="fp-confirm"
              type={showPassword ? "text" : "password"}
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
    </AuthPageLayout>
  );
}