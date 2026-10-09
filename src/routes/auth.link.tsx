import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandName } from "@/components/BrandName";
import { supabase } from "@/integrations/supabase/client";
import { DEVICE_TOKEN_KEY } from "@/lib/auth/identity";
import { loadSessionState } from "@/lib/auth/session";
import { claimDeviceFn } from "@/lib/api/auth.functions";
import { PLATFORM_NAME } from "@/lib/brand";

/**
 * Landing page for the one-time links the platform admin shares
 * (Users → "Sign-in link"). Two kinds:
 *   type=magiclink — signs the person in.
 *   type=recovery  — signs the person in; the app then asks for a new password
 *                    (the server already flagged the account, see createLoginLinkFn).
 *
 * The link is only used when the person taps the button, not on page load, so
 * WhatsApp / browser link previews can't burn the one-time token.
 */
export const Route = createFileRoute("/auth/link")({
  validateSearch: (search: Record<string, unknown>): { token_hash?: string; type?: "magiclink" | "recovery" } => ({
    token_hash: typeof search.token_hash === "string" ? search.token_hash : undefined,
    type: search.type === "recovery" ? "recovery" : search.type === "magiclink" ? "magiclink" : undefined,
  }),
  head: () => ({
    meta: [{ title: `Sign in — ${PLATFORM_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: AuthLinkPage,
});

function AuthLinkPage() {
  const { token_hash: tokenHash, type } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const valid = Boolean(tokenHash && type);
  const isReset = type === "recovery";

  const continueSignIn = async () => {
    if (!tokenHash || !type) return;
    setBusy(true);
    setError("");
    try {
      const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (otpError) {
        setError(
          /banned|deactivated/i.test(otpError.message)
            ? "This account is deactivated."
            : "This link has expired or was already used. Ask your admin for a new one.",
        );
        return;
      }

      // One signed-in device per staff/worker account: this device takes over, because the admin
      // deliberately sent the link to it. The server records the session and signs the others out.
      // (Done before loading the account: until then the database only trusts the previous session.)
      try {
        const { deviceToken } = await claimDeviceFn();
        if (deviceToken) localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
      } catch {
        await supabase.auth.signOut();
        setError("Unable to start your device session. Please try again.");
        return;
      }

      const res = await loadSessionState();
      if (!res.ok) {
        await supabase.auth.signOut();
        setError(res.message || "Unable to sign in. Ask your admin for a new link.");
        return;
      }

      // Full reload so the app's sign-in gate starts from the new session
      // (it also shows the "choose a password" step after a reset link).
      window.location.assign("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#eef6e6] px-4 py-6 dark:bg-[#0a130d]">
      <div className="w-full max-w-[420px] rounded-[2rem] border border-border/60 bg-card p-7 shadow-lg sm:p-9">
        <div className="mb-7 flex items-center gap-2">
          <BrandLogo className="h-9 w-9" />
          <BrandName className="text-lg font-bold tracking-tight" />
        </div>

        {valid ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight">{isReset ? "Reset your password" : "Sign in"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isReset
                ? "Tap continue to sign in, then choose a new password."
                : "Your admin sent you this link. Tap continue to sign in — no password needed."}
            </p>
            {error && <p className="mt-4 text-sm font-medium text-destructive">{error}</p>}
            <Button className="mt-6 h-12 w-full rounded-full font-semibold" onClick={continueSignIn} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Link not valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This link is incomplete. Ask your admin to send a new one, or sign in the usual way.
            </p>
            <Button asChild variant="outline" className="mt-6 h-12 w-full rounded-full">
              <a href="/dashboard">Go to sign in</a>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}