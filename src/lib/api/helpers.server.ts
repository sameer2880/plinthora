/**
 * SERVER-ONLY building blocks for the server functions (auth / users / businesses).
 * Named *.server.ts so it can never be bundled for the browser; the .functions.ts
 * files load it lazily inside their handlers.
 */
import { getRequest } from "@tanstack/react-start/server";
import { AUTH_EMAIL_DOMAIN, workerAuthEmail } from "@/lib/auth/identity";
import type { Caller, Role, UserContext, WorkerRow } from "./schemas";

export const cleanUsername = (v?: string | null) => v?.trim().toLowerCase() || null;
export const cleanEmail = (v?: string | null) => v?.trim().toLowerCase() || null;
export const escapeLike = (v: string) => v.replace(/[\\%_]/g, "\\$&");

const DUPLICATE_PHONE = "This mobile number is already used by another account";

export function friendly(message: string) {
  if (/username/i.test(message) && /unique|duplicate|already/i.test(message)) return "This username is already taken";
  return /already|registered|exists|duplicate|unique/i.test(message) ? DUPLICATE_PHONE : message;
}

/* ------------------------------------------------------------------ */
/* Clients                                                             */
/* ------------------------------------------------------------------ */
export async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
type Admin = Awaited<ReturnType<typeof adminClient>>;

/* ------------------------------------------------------------------ */
/* Who is calling?                                                     */
/* ------------------------------------------------------------------ */
/** Reads the caller's identity through THEIR session, so row-level security vouches for it. */
export async function getCaller(context: UserContext): Promise<Caller> {
  const { supabase, userId } = context;
  const [superRes, businessRes, workerRes] = await Promise.all([
    supabase.rpc("is_super_admin"),
    supabase.rpc("my_business_id"),
    supabase.from("workers").select("id, role").eq("auth_user_id", userId).maybeSingle(),
  ]);
  const isSuper = superRes.data === true;
  const worker = workerRes.data as { id: string; role: Role } | null;
  const role = isSuper ? "admin" : worker?.role;
  if (role !== "admin" && role !== "manager") throw new Error("You don't have permission to manage users");
  return {
    userId,
    isSuper,
    role,
    businessId: isSuper ? null : ((businessRes.data as string | null) ?? null),
    workerId: worker?.id ?? null,
  };
}

export async function requireSuperAdmin(context: UserContext) {
  const { data } = await context.supabase.rpc("is_super_admin");
  if (data !== true) throw new Error("Only the platform admin can do this");
}

/** Business admins/managers always act inside their own business; the platform admin must name one. */
export async function targetBusinessId(caller: Caller, requested?: string | null) {
  if (!caller.isSuper) {
    if (!caller.businessId) throw new Error("Your business is not active");
    return caller.businessId;
  }
  if (!requested) throw new Error("Choose a business");
  const admin = await adminClient();
  const { data } = await admin.from("businesses").select("id").eq("id", requested).maybeSingle();
  if (!data) throw new Error("Business not found");
  return requested;
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */
export async function loadTarget(caller: Caller, id: string): Promise<WorkerRow> {
  const admin = await adminClient();
  const { data, error } = await admin
    .from("workers")
    .select("id, business_id, name, phone, role, active, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // Same message for "missing" and "someone else's" so ids can't be probed.
  if (!data || (!caller.isSuper && data.business_id !== caller.businessId)) throw new Error("User not found");
  if (caller.role === "manager" && data.role !== "worker") {
    throw new Error("You can only manage worker accounts. Ask the admin for this change.");
  }
  return data as WorkerRow;
}

/**
 * Mobile numbers and usernames are unique among staff/workers by database index;
 * this covers the other table so a business user can never clash with the platform admin.
 */
export async function assertPlatformIdentityFree(admin: Admin, input: { phone?: string | null; username?: string | null }) {
  const phone = input.phone?.trim();
  const username = cleanUsername(input.username);
  if (phone) {
    const { data } = await admin.from("platform_admins").select("user_id").eq("phone", phone).limit(1);
    if (data && data.length > 0) throw new Error(DUPLICATE_PHONE);
  }
  if (username) {
    const { data } = await admin.from("platform_admins").select("user_id").ilike("username", escapeLike(username)).limit(1);
    if (data && data.length > 0) throw new Error("This username is already taken");
  }
}

/**
 * Creates the Auth account and the workers row. The account starts with a long
 * random password nobody knows, so the only way in is the one-time invite link
 * (see createAccessLink). They choose their own password when they open it.
 */
export async function provisionUser(input: {
  businessId: string;
  name: string;
  phone: string;
  email?: string | null;
  username?: string | null;
  role: Role;
  daily_wage: number;
  notes?: string | null;
}) {
  const admin = await adminClient();
  await assertPlatformIdentityFree(admin, input);

  const workerId = crypto.randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: workerAuthEmail(workerId),
    password: randomPassword(),
    email_confirm: true,
    user_metadata: { name: input.name, business_id: input.businessId, role: input.role },
  });
  if (error || !created.user) throw new Error(friendly(error?.message ?? "Unable to create the account"));

  const { data: row, error: insertError } = await admin
    .from("workers")
    .insert({
      id: workerId,
      business_id: input.businessId,
      name: input.name,
      phone: input.phone,
      email: cleanEmail(input.email),
      username: cleanUsername(input.username),
      role: input.role,
      daily_wage: input.role === "worker" ? input.daily_wage : 0,
      notes: input.notes?.trim() || null,
      active: true,
      auth_user_id: created.user.id,
      must_set_password: true,
    })
    .select("id")
    .single();
  if (insertError || !row) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(friendly(insertError?.message ?? "Unable to save the user"));
  }
  return { workerId: row.id as string, authUserId: created.user.id };
}


/* ------------------------------------------------------------------ */
/* Passwords, invite / reset links                                     */
/* ------------------------------------------------------------------ */
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+?";

function pick(chars: string) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / chars.length) * chars.length;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return chars[buf[0] % chars.length];
}

/** A long random password with every character class (so it passes any Auth password policy). Nobody ever sees it. */
export function randomPassword() {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < 28) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = pickIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function pickIndex(n: number) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

/**
 * One-time link for a user. "recovery" signs them in and the app then makes
 * them choose a password; "magiclink" just signs them in.
 * Only the hashed token leaves the server; the browser builds /auth/link from it.
 */
export async function createAccessLink(authUserId: string, kind: "recovery" | "magiclink" = "recovery") {
  const admin = await adminClient();
  const { data: authUser, error: userError } = await admin.auth.admin.getUserById(authUserId);
  const loginEmail = authUser?.user?.email;
  if (userError || !loginEmail) throw new Error(userError?.message ?? "Unable to find this user's login");
  const { data: link, error } = await admin.auth.admin.generateLink({ type: kind, email: loginEmail });
  const tokenHash = link?.properties?.hashed_token;
  if (error || !tokenHash) throw new Error(error?.message ?? "Unable to create the link");
  return { tokenHash, type: kind };
}

/**
 * Locks out every signed-in session of this worker at once: the device token is
 * cleared and the owning-session id is set to one nobody has, so the database
 * policies refuse every old session until the person signs in again.
 */
export async function revokeDeviceSession(admin: Admin, workerId: string) {
  const { error } = await admin
    .from("workers")
    // active_session_id is added by the security_hardening migration (types.ts is generated, so cast)
    .update({ session_token: null, active_session_id: crypto.randomUUID() } as never)
    .eq("id", workerId);
  if (error) throw new Error(error.message);
}

/**
 * Forgot-password / reset for one user: their old password stops working
 * immediately, their signed-in devices are locked out, and a one-time link is
 * returned for the admin to hand over. The person chooses a new password when
 * they open it.
 */
export async function issueResetLink(target: { id: string; auth_user_id: string | null }) {
  if (!target.auth_user_id) throw new Error("This user has no login yet — save them with a mobile number first");
  const admin = await adminClient();
  const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, { password: randomPassword() });
  if (error) throw new Error(error.message);
  const { error: rowError } = await admin.from("workers").update({ must_set_password: true }).eq("id", target.id);
  if (rowError) throw new Error(rowError.message);
  await revokeDeviceSession(admin, target.id);
  return createAccessLink(target.auth_user_id, "recovery");
}

/* ------------------------------------------------------------------ */
/* Server-side sign-in helpers                                         */
/* ------------------------------------------------------------------ */
function b64urlToJson(part: string): Record<string, unknown> {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return JSON.parse(atob(b64));
}

/** Reads a claim from a JWT we just received from Supabase Auth (not used to trust anyone). */
export function jwtClaim(token: string, name: string): string | null {
  try {
    const value = b64urlToJson(token.split(".")[1])[name];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** The caller's IP as set by the hosting platform's proxy. */
export function clientIp() {
  const headers = getRequest()?.headers;
  const real = headers?.get("x-real-ip")?.trim();
  if (real) return real;
  return headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

async function hmacBytes(value: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export async function hmacHex(value: string) {
  return Array.from(await hmacBytes(value)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A login address that never exists, but looks exactly like a real one
 * ("<uuid>@domain") and is always the same for the same typed text. Unknown
 * accounts therefore behave exactly like known ones with a wrong password.
 */
export async function decoyLoginEmail(identifier: string) {
  const b = await hmacBytes(`decoy:${identifier.toLowerCase()}`);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b.slice(0, 16)).map((x) => x.toString(16).padStart(2, "0")).join("");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return `${id}@${AUTH_EMAIL_DOMAIN}`;
}

/** Counts a hit against `key`. Returns false once the limit is passed. If the limiter is unavailable it lets the request through (and logs). */
export async function withinRateLimit(key: string, max: number, windowSeconds: number) {
  const admin = await adminClient();
  const { data, error } = await (admin as unknown as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> }).rpc(
    "hit_rate_limit",
    { p_key: key, p_max: max, p_window_seconds: windowSeconds },
  );
  if (error) {
    console.error("[rate-limit] unavailable — run the security_hardening migration:", error.message);
    return true;
  }
  return data === true;
}

/** Works out which Auth address a typed mobile number / email / username belongs to, or null. */
export async function resolveLoginEmail(raw: string): Promise<string | null> {
  const admin = await adminClient();
  const digits = raw.replace(/[\s+-]/g, "");
  let column: "phone" | "email" | "username";
  let value: string;
  if (/^\d{10,12}$/.test(digits)) {
    column = "phone";
    value = digits.slice(-10);
  } else if (raw.includes("@")) {
    column = "email";
    value = raw.toLowerCase();
  } else {
    column = "username";
    value = raw.toLowerCase();
  }

  let staff = admin.from("workers").select("id").not("auth_user_id", "is", null).eq("active", true);
  staff = column === "phone" ? staff.eq("phone", value) : staff.ilike(column, escapeLike(value));
  const { data: staffRows } = await staff.limit(2);
  if (staffRows && staffRows.length === 1) return workerAuthEmail(staffRows[0].id as string);
  if (staffRows && staffRows.length > 1) return null; // ambiguous

  let platform = admin.from("platform_admins").select("email");
  platform = column === "phone" ? platform.eq("phone", value) : platform.ilike(column, escapeLike(value));
  const { data: platformRows } = await platform.limit(2);
  if (platformRows && platformRows.length === 1 && platformRows[0].email) return platformRows[0].email as string;

  // An email may still be an Auth address as typed (the caller only ever learns pass/fail).
  return column === "email" ? value : null;
}

/** A sign-in client using the public key — used only to check a password on the server. */
export async function anonClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY");
  const isNewKey = key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
  const wrapped: typeof fetch = (input, init) => {
    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isNewKey && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
  return createClient(url, key, {
    global: { fetch: wrapped },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Makes this session the only one for a staff/worker account: records the
 * session id (the database policies then refuse every other session) and signs
 * the account's other sessions out. Returns the device token the browser keeps,
 * or null for accounts with no worker row (the platform admin).
 */
export async function claimDevice(authUserId: string, accessToken: string) {
  const admin = await adminClient();
  const { data: worker } = await admin.from("workers").select("id").eq("auth_user_id", authUserId).maybeSingle();
  if (!worker) return null;
  const sessionId = jwtClaim(accessToken, "session_id");
  const deviceToken = crypto.randomUUID();
  const { error } = await admin
    .from("workers")
    .update({ session_token: deviceToken, active_session_id: sessionId } as never)
    .eq("id", worker.id as string);
  if (error) throw new Error(error.message);
  const { error: signOutError } = await admin.auth.admin.signOut(accessToken, "others");
  if (signOutError) console.error("[claimDevice] could not sign out other sessions:", signOutError.message);
  return deviceToken;
}