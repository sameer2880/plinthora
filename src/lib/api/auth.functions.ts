import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sign-in happens on the server, in one step:
 *   typed mobile / email / username + password  ->  a session.
 *
 * Why: the browser never learns which Auth address belongs to a typed name
 * (the old lookup returned a real address for known people and a different one
 * for unknown people, so accounts could be told apart). Here a wrong name and a
 * wrong password give the same answer in the same shape, and attempts are rate
 * limited per IP address (not per account, so nobody can lock another person out).
 *
 * It also enforces the one-device rule: a staff/worker account that is signed
 * in elsewhere needs a confirmed takeover, and a successful sign-in signs every
 * other session of that account out (the database policies also refuse them).
 */
export type SignInResult =
  | { status: "ok"; accessToken: string; refreshToken: string; deviceToken: string | null }
  | { status: "needs_takeover" }
  | { status: "error"; message: string };

const GENERIC = "Invalid credentials";

export const signInFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        identifier: z.string().trim().min(1).max(200),
        password: z.string().min(1).max(200),
        deviceToken: z.string().max(100).nullish(),
        takeover: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<SignInResult> => {
    const h = await import("./helpers.server");

    // Rate limits are per IP address, so a stranger can slow themselves down but cannot lock a real user out.
    const ip = h.clientIp();
    const idKey = (await h.hmacHex(data.identifier.toLowerCase())).slice(0, 24);
    const okIp = await h.withinRateLimit(`signin:ip:${ip}`, 60, 600);
    const okPair = await h.withinRateLimit(`signin:pair:${ip}:${idKey}`, 8, 900);
    if (!okIp || !okPair) return { status: "error", message: "Too many sign-in attempts. Please wait a few minutes and try again." };

    // Unknown names still go through a real password check against an address that cannot exist.
    const email = (await h.resolveLoginEmail(data.identifier)) ?? (await h.decoyLoginEmail(data.identifier));

    const anon = await h.anonClient();
    const { data: signedIn, error } = await anon.auth.signInWithPassword({ email, password: data.password });
    if (error || !signedIn.session || !signedIn.user) {
      return { status: "error", message: /banned|deactivated/i.test(error?.message ?? "") ? "This account is deactivated" : GENERIC };
    }
    const { access_token: accessToken, refresh_token: refreshToken } = signedIn.session;

    const admin = await h.adminClient();
    const { data: worker } = await admin
      .from("workers")
      .select("id, session_token")
      .eq("auth_user_id", signedIn.user.id)
      .maybeSingle();

    let deviceToken: string | null = null;
    if (worker) {
      const elsewhere = Boolean(worker.session_token) && worker.session_token !== (data.deviceToken ?? null);
      if (elsewhere && !data.takeover) {
        await admin.auth.admin.signOut(accessToken, "local"); // drop the session we just made
        return { status: "needs_takeover" };
      }
      deviceToken = await h.claimDevice(signedIn.user.id, accessToken);
    }

    return { status: "ok", accessToken, refreshToken, deviceToken };
  });

/**
 * Used after a one-time link sign-in (/auth/link): this device takes over the
 * account and every other session is signed out. Returns the device token to keep.
 */
export const claimDeviceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const h = await import("./helpers.server");
    const token = getRequest()?.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    const deviceToken = await h.claimDevice(context.userId as string, token);
    return { deviceToken };
  });