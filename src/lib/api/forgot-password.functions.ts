import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * "Forgot password" with a one-time code (OTP), from the sign-in page.
 *
 *   1. requestResetOtpFn  — the person types their username / email / mobile. If that account has an
 *      email saved, a 6-digit code is emailed to it. The answer is ALWAYS the same, so nobody can
 *      find out which usernames or emails exist.
 *   2. verifyResetOtpFn   — the person enters the code; only a correct code moves on.
 *   3. confirmResetOtpFn  — the person chooses a new password (the code is checked again here).
 *
 * Security notes
 *  - Public on purpose (nobody is signed in yet), so everything is checked here.
 *  - Only a keyed hash of the code is stored; codes last 10 minutes, work once, and die after 5 wrong tries.
 *  - Requests are throttled per IP address and per account, and a new code can't be requested within 60 seconds.
 *  - A successful reset locks the account's signed-in devices out, like an admin reset does.
 */

const CODE_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_WRONG_TRIES = 5;
const GENERIC_BAD_CODE = "That code is incorrect or has expired. Request a new code and try again.";

type Db = { from: (table: string) => any };

type Account = { authUserId: string; email: string | null; phone: string | null; workerId: string | null };

const identifierSchema = z.string().trim().min(1, "Enter your username, email or mobile number").max(200);

async function findAccount(identifier: string): Promise<Account | null> {
  const h = await import("./helpers.server");
  const admin = await h.adminClient();
  const db = admin as unknown as Db;

  const digits = identifier.replace(/[\s+-]/g, "");
  let column: "phone" | "email" | "username";
  let value: string;
  if (/^\d{10,12}$/.test(digits)) {
    column = "phone";
    value = digits.slice(-10);
  } else if (identifier.includes("@")) {
    column = "email";
    value = identifier.toLowerCase();
  } else {
    column = "username";
    value = identifier.toLowerCase();
  }

  // Business users (worker / manager / admin)
  let staff = db
    .from("workers")
    .select("id, email, phone, auth_user_id")
    .not("auth_user_id", "is", null)
    .eq("active", true);
  staff = column === "phone" ? staff.eq("phone", value) : staff.ilike(column, h.escapeLike(value));
  const { data: staffRows } = await staff.limit(2);
  if (Array.isArray(staffRows) && staffRows.length > 1) return null; // ambiguous
  if (Array.isArray(staffRows) && staffRows.length === 1) {
    const r = staffRows[0];
    return {
      authUserId: r.auth_user_id as string,
      email: ((r.email as string | null) ?? null)?.trim() || null,
      phone: (r.phone as string | null) ?? null,
      workerId: r.id as string,
    };
  }

  // The platform admin
  let platform = db.from("platform_admins").select("user_id, email, phone");
  platform = column === "phone" ? platform.eq("phone", value) : platform.ilike(column, h.escapeLike(value));
  const { data: platformRows } = await platform.limit(2);
  if (Array.isArray(platformRows) && platformRows.length === 1) {
    const r = platformRows[0];
    return {
      authUserId: r.user_id as string,
      email: ((r.email as string | null) ?? null)?.trim() || null,
      phone: (r.phone as string | null) ?? null,
      workerId: null,
    };
  }
  return null;
}

/** Same-length comparison that doesn't leak how many characters matched. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function newCode() {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
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

/**
 * Checks the code for an account WITHOUT spending it. A wrong code counts as a try (5 max);
 * every failure gives the same message. Used by both the "check code" and the "set password" steps,
 * so the password step can never be reached with a wrong code.
 */
async function checkCode(identifier: string, code: string) {
  const h = await import("./helpers.server");

  const ip = h.clientIp();
  if (!(await h.withinRateLimit(`otp-confirm:ip:${ip}`, 30, 900))) {
    throw new Error("Too many attempts. Please wait a few minutes and try again.");
  }

  const account = await findAccount(identifier);
  if (!account) throw new Error(GENERIC_BAD_CODE);

  const admin = await h.adminClient();
  const db = admin as unknown as Db;

  const { data: row } = await db
    .from("password_reset_otps")
    .select("id, code_hash, attempts, expires_at")
    .eq("auth_user_id", account.authUserId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || new Date(row.expires_at as string).getTime() < Date.now() || (row.attempts as number) >= MAX_WRONG_TRIES) {
    throw new Error(GENERIC_BAD_CODE);
  }

  const given = await h.hmacHex(`otp:${account.authUserId}:${code}`);
  if (!safeEqual(given, row.code_hash as string)) {
    const attempts = (row.attempts as number) + 1;
    await db
      .from("password_reset_otps")
      .update({ attempts, ...(attempts >= MAX_WRONG_TRIES ? { consumed_at: new Date().toISOString() } : {}) })
      .eq("id", row.id);
    throw new Error(GENERIC_BAD_CODE);
  }

  return { account, rowId: row.id as string, admin, db, h };
}

/* ------------------------------------------------------------------ */
/* Step 1 — send the code                                              */
/* ------------------------------------------------------------------ */
export const requestResetOtpFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ identifier: identifierSchema }).parse(input))
  .handler(async ({ data }) => {
    const h = await import("./helpers.server");
    const mail = await import("./email.server");

    if (!mail.emailConfigured()) {
      throw new Error("Code by email isn't available yet. Please ask your admin for a password reset link.");
    }

    const ip = h.clientIp();
    const idKey = (await h.hmacHex(data.identifier.toLowerCase())).slice(0, 24);
    const okIp = await h.withinRateLimit(`otp-request:ip:${ip}`, 10, 900);
    const okId = await h.withinRateLimit(`otp-request:id:${idKey}`, 5, 3600);
    if (!okIp || !okId) throw new Error("Too many requests. Please wait a few minutes and try again.");

    // Whatever happens below, the caller gets this same answer.
    const reply = { ok: true as const, minutes: CODE_MINUTES };

    const account = await findAccount(data.identifier);
    if (!account || !account.email) return reply;

    const admin = await h.adminClient();
    const db = admin as unknown as Db;

    // Don't send a second code within the cooldown.
    const { data: latest } = await db
      .from("password_reset_otps")
      .select("created_at")
      .eq("auth_user_id", account.authUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.created_at && Date.now() - new Date(latest.created_at as string).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      return reply;
    }

    // Only the newest code is valid.
    await db
      .from("password_reset_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("auth_user_id", account.authUserId)
      .is("consumed_at", null);

    const code = newCode();
    const codeHash = await h.hmacHex(`otp:${account.authUserId}:${code}`);
    const { error: insertError } = await db.from("password_reset_otps").insert({
      auth_user_id: account.authUserId,
      code_hash: codeHash,
      expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    });
    if (insertError) {
      console.error("[forgot-password] could not store code — run the password_reset_otp migration:", insertError.message);
      return reply;
    }

    try {
      await mail.sendResetCodeEmail(account.email, code, CODE_MINUTES);
    } catch (e) {
      // Logged for you; the caller isn't told, so a failure can't be used to probe accounts.
      console.error("[forgot-password] email failed:", e instanceof Error ? e.message : e);
    }
    return reply;
  });

/* ------------------------------------------------------------------ */
/* Step 2 — check the code (nothing is changed yet)                    */
/* ------------------------------------------------------------------ */
const codeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

export const verifyResetOtpFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ identifier: identifierSchema, code: codeSchema }).parse(input))
  .handler(async ({ data }) => {
    await checkCode(data.identifier, data.code);
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ */
/* Step 3 — set the new password (the code is checked again here)      */
/* ------------------------------------------------------------------ */
export const confirmResetOtpFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        identifier: identifierSchema,
        code: codeSchema,
        newPassword: z.string().min(1, "Enter a new password").max(72, "Password is too long"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { passwordProblem } = await import("@/lib/auth/password");
    const { account, rowId, admin, db, h } = await checkCode(data.identifier, data.code);

    // The code is right. Check the new password before spending the code, so a weak password can be fixed and retried.
    const problem = passwordProblem(data.newPassword, { phone: account.phone });
    if (problem) throw new Error(problem);

    // Spend the code first (and only once), so it can never be replayed.
    const { data: spent } = await db
      .from("password_reset_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", rowId)
      .is("consumed_at", null)
      .select("id");
    if (!Array.isArray(spent) || spent.length !== 1) throw new Error(GENERIC_BAD_CODE);

    const { error } = await admin.auth.admin.updateUserById(account.authUserId, { password: data.newPassword });
    if (error) throw new Error(passwordMessage(error.message));

    // They chose their own password: no first-sign-in prompt, and every signed-in device is locked out.
    if (account.workerId) {
      await db.from("workers").update({ must_set_password: false }).eq("id", account.workerId);
      try {
        await h.revokeDeviceSession(admin, account.workerId);
      } catch (e) {
        // The password is already changed, so never report a failure now. Fall back to clearing the device token.
        console.error("[forgot-password] could not revoke device session:", e instanceof Error ? e.message : e);
        await db.from("workers").update({ session_token: null }).eq("id", account.workerId);
      }
    }

    return { ok: true as const };
  });