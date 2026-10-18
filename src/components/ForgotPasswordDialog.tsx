import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { confirmResetOtpFn, requestResetOtpFn } from "@/lib/api/forgot-password.functions";
import { passwordProblem } from "@/lib/auth/password";

/**
 * "Forgot password?" on the sign-in page.
 *
 *   Step 1  type username / email / mobile  ->  a 6-digit code is emailed (if the account has an email saved)
 *   Step 2  type the code + a new password  ->  password changed, sign in as usual
 *
 * The answer after step 1 is always the same, so it never reveals whether an account exists.
 * People with no email saved can still ask the admin for a reset link.
 */
export function ForgotPasswordDialog({
  open,
  onOpenChange,
  onAskAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the "Need access?" request form, pre-set to a password-help request. */
  onAskAdmin?: () => void;
}) {
  const [step, setStep] = useState<"identify" | "verify">("identify");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Start fresh every time the dialog is opened.
  useEffect(() => {
    if (!open) return;
    setStep("identify");
    setIdentifier("");
    setCode("");
    setPassword("");
    setConfirm("");
    setShowPassword(false);
    setBusy(false);
    setError("");
    setCooldown(0);
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

  const sendCode = async () => {
    if (!identifier.trim()) {
      setError("Enter your username, email or mobile number");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestResetOtpFn({ data: { identifier: identifier.trim() } });
      setStep("verify");
      setCode("");
      setCooldown(60);
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
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }
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
      onOpenChange(false);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-[420px] rounded-[1.5rem] sm:p-7">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "identify" ? <KeyRound className="h-5 w-5 text-primary" /> : <MailCheck className="h-5 w-5 text-primary" />}
            {step === "identify" ? "Forgot your password?" : "Enter your code"}
          </DialogTitle>
          <DialogDescription>
            {step === "identify"
              ? "Enter your username, email or mobile number. If your account has an email saved, we'll send a 6-digit code to it."
              : "If that account has an email saved, a 6-digit code was sent to it. It works for 10 minutes."}
          </DialogDescription>
        </DialogHeader>

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
                className="h-11 rounded-xl"
                disabled={busy}
              />
            </div>
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {onAskAdmin && (
                <Button type="button" variant="outline" className="h-11 rounded-full font-semibold" onClick={onAskAdmin} disabled={busy}>
                  No email? Ask admin
                </Button>
              )}
              <Button type="submit" className="h-11 rounded-full font-semibold" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code"}
              </Button>
            </DialogFooter>
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
              <Label>6-digit code</Label>
              <InputOTP maxLength={6} value={code} onChange={(v) => setCode(v.replace(/\D/g, ""))} inputMode="numeric" autoComplete="one-time-code" disabled={busy}>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fp-password">New password</Label>
              <div className="relative">
                <Input
                  id="fp-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="h-11 rounded-xl pr-11"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
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
                className="h-11 rounded-xl"
                disabled={busy}
              />
            </div>

            {error && <p className="text-xs font-medium text-destructive">{error}</p>}

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" className="h-11 rounded-full font-semibold" onClick={resend} disabled={busy || cooldown > 0}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </Button>
              <Button type="submit" className="h-11 rounded-full font-semibold" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Change password"}
              </Button>
            </DialogFooter>
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
        )}
      </DialogContent>
    </Dialog>
  );
}