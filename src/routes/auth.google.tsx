import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandWordmark } from "@/components/BrandWordmark";
import { LoadingScreen } from "@/components/LoadingScreen";
import { supabase } from "@/integrations/supabase/client";
import { DEVICE_TOKEN_KEY } from "@/lib/auth/identity";
import { loadSessionState } from "@/lib/auth/session";
import { googleSignInFn } from "@/lib/api/auth.functions";
import { friendlyNetworkMessage } from "@/lib/connection";
import { isNativeApp } from "@/lib/native-oauth";
import { PLATFORM_NAME } from "@/lib/brand";

/**
 * Where Google sends the person back to after "Continue with Google".
 * Supabase has just signed them in as a temporary Google user; googleSignInFn
 * swaps that for the real account whose saved email matches (see auth.functions.ts).
 */
export const Route = createFileRoute("/auth/google")({
  head: () => ({
    meta: [{ title: `Sign in — ${PLATFORM_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: AuthGooglePage,
});

type Phase = "working" | "takeover" | "error" | "handoff";

function AuthGooglePage() {
  const [phase, setPhase] = useState<Phase>("working");
  const [error, setError] = useState("");
  const started = useRef(false);
  // Set when this page is the browser tab the app opened: the link that opens the app again.
  const [appLink, setAppLink] = useState("");

  const run = async (takeover: boolean) => {
    setPhase("working");
    setError("");
    try {
      // Google reports a failed / cancelled sign-in in the address bar.
      const params = new URLSearchParams(window.location.search + "&" + window.location.hash.replace(/^#/, ""));
      if (params.get("error") || params.get("error_description")) {
        throw new Error("Google sign-in was cancelled or failed. Please try again.");
      }

      // Waits for the Google session in the address to be picked up.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Google sign-in did not complete. Please try again.");

      const result = await googleSignInFn({
        data: { deviceToken: localStorage.getItem(DEVICE_TOKEN_KEY), takeover },
      });

      if (result.status === "needs_takeover") {
        setPhase("takeover");
        return;
      }
      if (result.status === "error") throw new Error(result.message);

      if (result.accessToken && result.refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
        });
        if (sessionError) throw new Error("Unable to sign in right now. Please try again.");
      }
      if (result.deviceToken) localStorage.setItem(DEVICE_TOKEN_KEY, result.deviceToken);

      const res = await loadSessionState();
      if (!res.ok) throw new Error(res.message || "Unable to sign in");

      // Full reload so the sign-in gate starts from the new session.
      window.location.assign("/dashboard");
    } catch (e) {
      await supabase.auth.signOut().catch(() => undefined);
      localStorage.removeItem(DEVICE_TOKEN_KEY);
      setError(friendlyNetworkMessage(e) ?? (e instanceof Error ? e.message : "Unable to sign in right now."));
      setPhase("error");
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // The app opened Google in the phone's browser (?app=1). Pass the result back to the app,
    // which finishes the sign-in inside itself. The tokens are taken out of the address
    // first, so this browser never keeps a Google session of its own.
    const params = new URLSearchParams(window.location.search);
    if (params.get("app") === "1" && !isNativeApp()) {
      const hash = window.location.hash;
      params.delete("app");
      const query = params.toString();
      window.history.replaceState(null, "", window.location.pathname + "?app=1");
      const link = `com.plinthora.app://auth/google${query ? `?${query}` : ""}${hash}`;
      setAppLink(link);
      setPhase("handoff");
      window.location.href = link;
      return;
    }

    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = async () => {
    await supabase.auth.signOut().catch(() => undefined);
    window.location.assign("/dashboard");
  };

  if (phase === "working") {
    return <LoadingScreen title="Signing you in…" subtitle="Please wait a moment" />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#eef6e6] px-4 py-6">
      <div className="w-full max-w-[420px] rounded-[2rem] border border-border/60 bg-card p-7 shadow-lg sm:p-9">
        <div className="mb-7 flex items-center gap-2">
          <BrandLogo className="h-9 w-9" />
          <BrandWordmark className="h-5" />
        </div>

        {phase === "handoff" && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Opening Plinthora…</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Google sign-in is done. If the app doesn't open by itself, tap the button below.
            </p>
            <Button asChild className="mt-6 h-12 w-full rounded-full font-semibold">
              <a href={appLink}>Open Plinthora app</a>
            </Button>
          </>
        )}

        {phase === "takeover" && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Already signed in elsewhere</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This account is already signed in on another device. Log out that device and continue here?
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="h-11 rounded-full font-semibold" onClick={cancel}>
                Cancel
              </Button>
              <Button className="h-11 rounded-full font-semibold" onClick={() => void run(true)}>
                Log out & continue
              </Button>
            </div>
          </>
        )}

        {phase === "error" && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Couldn't sign in</h1>
            <p className="mt-2 text-sm font-medium text-destructive">{error}</p>
            <Button asChild variant="outline" className="mt-6 h-12 w-full rounded-full">
              <a href="/dashboard">Back to sign in</a>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}