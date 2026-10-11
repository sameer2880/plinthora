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

/**
 * "Continue with Google" — for people whose admin saved their email on their account.
 *
 * Supabase creates a brand-new Auth user for a first Google login, but staff/worker
 * accounts use made-up Auth addresses (see identity.ts), so Google can't link to them by itself.
 * Here the server does the matching, using the Google-VERIFIED email:
 *   1. the caller proves who they are with the temporary Google session (middleware);
 *   2. we find the active staff/worker whose saved email matches (case-insensitive);
 *   3. we start a real session for THAT account (one-time link, verified server-side),
 *      apply the one-device rule, and delete the temporary Google user.
 * No matching email -> nothing is created and the person is told to ask their admin.
 * The platform admin signs in with a real email, so Supabase already links Google to
 * that account; we simply keep the session they have.
 */
export type GoogleSignInResult =
  | { status: "ok"; accessToken: string | null; refreshToken: string | null; deviceToken: string | null }
  | { status: "needs_takeover" }
  | { status: "error"; message: string };

const NOT_REGISTERED =
  "This Google account isn't registered. Ask your admin to add your email to your account, then try again.";

export const googleSignInFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        deviceToken: z.string().max(100).nullish(),
        takeover: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GoogleSignInResult> => {
    const h = await import("./helpers.server");
    const { workerAuthEmail } = await import("@/lib/auth/identity");

    const ip = h.clientIp();
    if (!(await h.withinRateLimit(`google:ip:${ip}`, 30, 600))) {
      return { status: "error", message: "Too many sign-in attempts. Please wait a few minutes and try again." };
    }

    const admin = await h.adminClient();
    const googleUserId = context.userId as string;

    const { data: found } = await admin.auth.admin.getUserById(googleUserId);
    const gUser = found?.user;
    const identity = gUser?.identities?.find((i) => i.provider === "google");
    const idData = (identity?.identity_data ?? {}) as { email?: string; email_verified?: boolean };
    const email = (idData.email ?? gUser?.email ?? "").trim().toLowerCase();
    if (!gUser || !identity || !email || idData.email_verified !== true) {
      return { status: "error", message: "Google could not confirm your email. Please try again." };
    }

    // Platform admin: Google got linked to their real-email account — keep this session.
    const { data: platformAdmin } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", googleUserId)
      .maybeSingle();
    if (platformAdmin) return { status: "ok", accessToken: null, refreshToken: null, deviceToken: null };

    // Staff / worker: match on the email the admin saved.
    const { data: rows } = await admin
      .from("workers")
      .select("id, active, session_token")
      .ilike("email", h.escapeLike(email))
      .not("auth_user_id", "is", null)
      .limit(2);

    const discard = async () => {
      // The temporary Google user belongs to nobody; remove it so no stray account is left behind.
      await admin.auth.admin.deleteUser(googleUserId).catch(() => undefined);
    };

    if (!rows || rows.length !== 1) {
      await discard();
      return { status: "error", message: NOT_REGISTERED };
    }
    const worker = rows[0] as { id: string; active: boolean; session_token: string | null };
    if (!worker.active) {
      await discard();
      return { status: "error", message: "This account is deactivated" };
    }

    // One signed-in device per account — same rule as the password sign-in.
    const elsewhere = Boolean(worker.session_token) && worker.session_token !== (data.deviceToken ?? null);
    if (elsewhere && !data.takeover) return { status: "needs_takeover" };

    // Start a real session for the worker's own Auth account.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: workerAuthEmail(worker.id),
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) return { status: "error", message: "Unable to sign in right now. Please try again." };

    const anon = await h.anonClient();
    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (verifyError || !verified.session) {
      return {
        status: "error",
        message: /banned|deactivated/i.test(verifyError?.message ?? "")
          ? "This account is deactivated"
          : "Unable to sign in right now. Please try again.",
      };
    }
    const { access_token: accessToken, refresh_token: refreshToken } = verified.session;

    // Signing in with a verified Google email replaces the "choose a password" step.
    await admin.from("workers").update({ must_set_password: false }).eq("id", worker.id);

    const deviceToken = await h.claimDevice(verified.session.user.id, accessToken);
    await discard();
    return { status: "ok", accessToken, refreshToken, deviceToken };
  });