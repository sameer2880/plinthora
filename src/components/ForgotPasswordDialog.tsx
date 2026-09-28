import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { forgotPasswordResetFn } from "@/lib/api/forgot-password.functions";

const inputClass =
  "h-12 rounded-full border-border bg-background px-5 text-sm shadow-none dark:border-white/15 dark:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-primary/40";

type Step = "identify" | "verify" | "done";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whatever was already typed in the sign-in box (username or email). */
  initialIdentifier?: string;
  /** Called after a successful reset so the sign-in form can be pre-filled. */
  onDone?: (identifier: string) => void;
  /** "Can't remember these details?" — falls back to the ask-your-admin help. */
  onAskAdmin?: () => void;
}

export function ForgotPasswordDialog({ open, onOpenChange, initialIdentifier = "", onDone, onAskAdmin }: Props) {
  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
  const [last4, setLast4] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setStep("identify");
    // Only reuse what was typed if it looks like a username/email (never a mobile number).
    setIdentifier(/^[\d\s+-]*$/.test(initialIdentifier) ? "" : initialIdentifier.trim());
    setLast4("");
    setPassword("");
    setConfirm("");
    setShow(false);
    setErr("");
    setBusy(false);
  }, [open, initialIdentifier]);

  const next = (e: FormEvent) => {
    e.preventDefault();
    const value = identifier.trim();
    if (!value) return setErr("Enter your username or email");
    if (/^[\d\s+-]+$/.test(value)) return setErr("Enter your username or email, not your mobile number");
    setErr("");
    // We deliberately don't check whether the account exists here — that would let anyone
    // discover valid usernames. Everything is verified together on the next step.
    setStep("verify");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");

    if (!/^\d{4}$/.test(last4)) return setErr("Enter the last 4 digits of your mobile number");
    if (password.length < 6) return setErr("Password must be at least 6 characters");
    if (password !== confirm) return setErr("Passwords do not match");

    setBusy(true);
    try {
      await forgotPasswordResetFn({ data: { identifier: identifier.trim(), last4, newPassword: password } });
      setPassword("");
      setConfirm("");
      setLast4("");
      setStep("done");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    onDone?.(identifier.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] rounded-[1.5rem] sm:p-7">
        {step === "identify" && (
          <form onSubmit={next} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Forgot your password?</DialogTitle>
              <DialogDescription>
                Enter your username or email to continue.
              </DialogDescription>
            </DialogHeader>

            <Input
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              placeholder="Username or email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className={inputClass}
            />

            {err && <p className="text-xs font-medium text-destructive">{err}</p>}

            <DialogFooter className="gap-2 sm:flex-col sm:space-x-0">
              <Button type="submit" className="h-11 w-full rounded-full font-semibold">
                Continue
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-full rounded-full text-sm"
                onClick={() => onOpenChange(false)}
              >
                Back to sign in
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === "verify" && (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Verify and set a new password</DialogTitle>
              <DialogDescription>
                Resetting for <span className="font-semibold text-foreground">{identifier.trim()}</span>. Enter the
                last 4 digits of the mobile number saved on your account.
              </DialogDescription>
            </DialogHeader>

            <Input
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="Last 4 digits of mobile number"
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className={inputClass}
            />

            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <Input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />

            {err && <p className="text-xs font-medium text-destructive">{err}</p>}

            <DialogFooter className="gap-2 sm:flex-col sm:space-x-0">
              <Button type="submit" disabled={busy} className="h-11 w-full rounded-full font-semibold">
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Changing…
                  </>
                ) : (
                  "Change password"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-full rounded-full text-sm"
                disabled={busy}
                onClick={() => {
                  setErr("");
                  setStep("identify");
                }}
              >
                Back
              </Button>
              {onAskAdmin && (
                <button
                  type="button"
                  onClick={onAskAdmin}
                  className="pt-1 text-center text-xs font-semibold text-primary hover:underline"
                >
                  Can't remember these details? Ask your admin
                </button>
              )}
            </DialogFooter>
          </form>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <DialogHeader className="items-center">
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <DialogTitle>Password changed</DialogTitle>
              <DialogDescription>You can now sign in with your new password.</DialogDescription>
            </DialogHeader>
            <Button type="button" className="h-11 w-full rounded-full font-semibold" onClick={finish}>
              Sign in
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}