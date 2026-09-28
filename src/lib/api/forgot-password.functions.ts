import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * "Forgot password" from the sign-in page.
 *
 * The person proves who they are with their username OR email plus the last 4
 * digits of the mobile number saved on their account, then picks a new password.
 *
 * Security notes
 *  - Public on purpose (nobody is signed in yet), so everything is checked here.
 *  - Every failure returns the SAME message, whether the account doesn't exist,
 *    has no mobile number, or the digits are wrong — usernames/emails can't be probed.
 *  - Wrong attempts are counted per identifier and locked (5 tries / 30 minutes)
 *    because 4 digits are easy to brute-force. See the password_reset_attempts migration.
 *  - Typing a mobile number as the identifier is rejected: the last-4 check would prove nothing.
 */

const MAX_FAILURES = 5;
const LOCK_MINUTES = 30;
const GENERIC_FAILURE =
  "We couldn't verify these details. Check them and try again, or ask your admin to reset your password.";

const inputSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or email").max(200),
  last4: z.string().trim().regex(/^\d{4}$/, "Enter the last 4 digits of your mobile number"),
  newPassword: z.string().min(6, "Password must be at least 6 characters").max(72, "Password is too long"),
});

type Db = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

async function hashKey(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Turns Supabase's password-policy errors into something a worker can act on. */
function passwordMessage(message: string) {
  if (/at least one character of each/i.test(message)) {
    return "Password must include a lowercase letter, an uppercase letter, a number and a symbol";
  }
  if (/at least \d+ characters|too short/i.test(message)) return "That password is too short";
  if (/same|different from the old/i.test(message)) return "Choose a password you haven't used before";
  if (/weak|pwned|breach|easy to guess/i.test(message)) return "That password is too easy to guess. Choose a stronger one";
  return "Unable to set that password. Try a different one";
}

export const forgotPasswordResetFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const h = await import("./helpers.server");
    const admin = await h.adminClient();
    const db = admin as unknown as Db;

    const raw = data.identifier;
    const key = await hashKey(raw.toLowerCase());

    /* ---- 1. locked out? (same answer for real and made-up identifiers) ---- */
    const { data: attempt } = await db
      .from("password_reset_attempts")
      .select("locked_until")
      .eq("key", key)
      .maybeSingle();
    const lockedUntil = attempt?.locked_until ? new Date(attempt.locked_until as string).getTime() : 0;
    if (lockedUntil > Date.now()) {
      const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60_000));
      throw new Error(`Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }

    const fail = async (): Promise<never> => {
      await db.rpc("register_password_reset_failure", {
        p_key: key,
        p_max: MAX_FAILURES,
        p_lock_minutes: LOCK_MINUTES,
      });
      throw new Error(GENERIC_FAILURE);
    };

    /* ---- 2. find the account: email or username only ---- */
    if (/^[\d\s+-]+$/.test(raw)) return fail(); // a mobile number is not accepted here
    const column: "email" | "username" = raw.includes("@") ? "email" : "username";
    const value = raw.toLowerCase();

    let authUserId: string | null = null;
    let phone: string | null = null;
    let workerId: string | null = null;

    // Business users (worker / manager / admin)
    const { data: staff } = await db
      .from("workers")
      .select("id, phone, auth_user_id")
      .not("auth_user_id", "is", null)
      .eq("active", true)
      .ilike(column, h.escapeLike(value))
      .limit(2);
    if (Array.isArray(staff) && staff.length > 1) return fail(); // ambiguous
    if (Array.isArray(staff) && staff.length === 1) {
      authUserId = staff[0].auth_user_id as string;
      phone = (staff[0].phone as string | null) ?? null;
      workerId = staff[0].id as string;
    } else {
      // The platform admin
      const { data: platform } = await db
        .from("platform_admins")
        .select("user_id, phone")
        .ilike(column, h.escapeLike(value))
        .limit(2);
      if (Array.isArray(platform) && platform.length === 1) {
        authUserId = platform[0].user_id as string;
        phone = (platform[0].phone as string | null) ?? null;
      }
    }

    /* ---- 3. check the last 4 digits ---- */
    const digits = (phone ?? "").replace(/\D/g, "");
    if (!authUserId || digits.length < 10 || digits.slice(-4) !== data.last4) return fail();

    // Their mobile number is the temporary password — don't allow it as the new one.
    if (data.newPassword.includes(digits.slice(-10))) {
      throw new Error("Choose a password that isn't your mobile number");
    }

    /* ---- 4. set the new password ---- */
    const { error } = await admin.auth.admin.updateUserById(authUserId, { password: data.newPassword });
    if (error) throw new Error(passwordMessage(error.message));

    // They chose their own password, so no first-sign-in prompt; also drop any device session
    // so the account isn't left signed in elsewhere under the old password.
    if (workerId) {
      await admin
        .from("workers")
        .update({ must_set_password: false, session_token: null })
        .eq("id", workerId);
    }

    await db.from("password_reset_attempts").delete().eq("key", key);
    return { ok: true as const };
  });