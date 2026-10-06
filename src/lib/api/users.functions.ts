import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MOBILE_REGEX, workerAuthEmail } from "@/lib/auth/identity";
import { userSchema, type Role, type UserContext } from "./schemas";

/**
 * Everything that creates, edits or removes LOGIN ACCOUNTS. It runs on the
 * server with the service-role key — the browser can never do it directly (the
 * database has no client write policy on `workers`).
 *
 * Who may do what (checked from the caller's own session, never from anything
 * the browser claims):
 *   platform admin — create / edit / reset / delete users of ANY business
 *                    (they pass the business); never sees a business's data
 *   business admin — the same, for their own business only
 *   manager        — create / edit / reset Workers of their own business
 *   worker         — nothing
 */

export const createUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => userSchema.extend({ businessId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const h = await import("./helpers.server");
    const caller = await h.getCaller(context as unknown as UserContext);
    const businessId = await h.targetBusinessId(caller, data.businessId);
    if (caller.role === "manager" && data.role !== "worker") {
      throw new Error("Managers can only add workers. Ask the admin to create a manager or admin.");
    }
    await h.provisionUser({ ...data, businessId });
    return { ok: true as const };
  });

export const updateUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => userSchema.extend({ id: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const h = await import("./helpers.server");
    const caller = await h.getCaller(context as unknown as UserContext);
    const target = await h.loadTarget(caller, data.id);
    if (caller.role === "manager" && data.role !== "worker") {
      throw new Error("Managers can only manage workers. Ask the admin for this change.");
    }

    // Nobody can demote or lock out their own account from here.
    const isSelf = target.id === caller.workerId;
    const role: Role = isSelf ? target.role : data.role;
    const active = isSelf ? true : data.active;

    const admin = await h.adminClient();
    await h.assertPlatformIdentityFree(admin, { phone: data.phone, username: data.username });
    let authUserId = target.auth_user_id;

    if (!authUserId) {
      // Legacy row without a login yet — create the account now.
      const { data: created, error } = await admin.auth.admin.createUser({
        email: workerAuthEmail(target.id),
        password: data.phone,
        email_confirm: true,
        user_metadata: { name: data.name, business_id: target.business_id, role },
      });
      if (error || !created.user) throw new Error(h.friendly(error?.message ?? "Unable to create the account"));
      authUserId = created.user.id;
    } else {
      const { error } = await admin.auth.admin.updateUserById(authUserId, {
        ban_duration: active ? "none" : "876000h",
        user_metadata: { name: data.name, business_id: target.business_id, role },
      });
      if (error) throw new Error(h.friendly(error.message));
    }

    const { error: updateError } = await admin
      .from("workers")
      .update({
        name: data.name,
        phone: data.phone,
        email: h.cleanEmail(data.email),
        username: h.cleanUsername(data.username),
        role,
        daily_wage: role === "worker" ? data.daily_wage : 0,
        notes: data.notes?.trim() || null,
        active,
        auth_user_id: authUserId,
        ...(target.auth_user_id ? {} : { must_set_password: true }),
      })
      .eq("id", target.id);
    if (updateError) throw new Error(h.friendly(updateError.message));
    return { ok: true as const };
  });

export const resetPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const h = await import("./helpers.server");
    const caller = await h.getCaller(context as unknown as UserContext);
    const target = await h.loadTarget(caller, data.id);
    if (!target.phone || !MOBILE_REGEX.test(target.phone)) {
      throw new Error("Add a valid mobile number before resetting the password");
    }
    if (!target.auth_user_id) throw new Error("This user has no login yet — save them with a mobile number first");

    const admin = await h.adminClient();
    const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, { password: target.phone });
    if (error) throw new Error(error.message);
    const { error: rowError } = await admin
      .from("workers")
      .update({ must_set_password: true, session_token: null })
      .eq("id", target.id);
    if (rowError) throw new Error(rowError.message);
    return { phone: target.phone };
  });

export const deleteUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const h = await import("./helpers.server");
    const caller = await h.getCaller(context as unknown as UserContext);
    if (caller.role !== "admin") throw new Error("Managers can't delete users. Please ask the admin.");
    const target = await h.loadTarget(caller, data.id);
    if (target.id === caller.workerId) throw new Error("You can't delete your own account");

    const admin = await h.adminClient();
    // Attendance, payments, feedback and location rows cascade with the worker.
    const { error } = await admin.from("workers").delete().eq("id", target.id);
    if (error) throw new Error(error.message);
    if (target.auth_user_id) await admin.auth.admin.deleteUser(target.auth_user_id);
    return { ok: true as const };
  });

/**
 * Platform admin only: when each user last signed in, keyed by the user's
 * worker id. Comes from the login system's own record (last_sign_in_at), so it
 * is the real time of the last sign-in — not a value the browser could fake.
 * null = the user has never signed in.
 */
export const getLastSignInsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const h = await import("./helpers.server");
    await h.requireSuperAdmin(context as unknown as UserContext);
    const admin = await h.adminClient();

    const { data: rows, error } = await admin.from("workers").select("id, auth_user_id");
    if (error) throw new Error(error.message);

    // authUserId -> last sign-in time (walk through every page of accounts)
    const byAuthId = new Map<string, string | null>();
    const perPage = 1000;
    for (let page = 1; ; page++) {
      const { data, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
      if (listError) throw new Error(listError.message);
      for (const u of data.users) byAuthId.set(u.id, u.last_sign_in_at ?? null);
      if (data.users.length < perPage) break;
    }

    const result: Record<string, string | null> = {};
    for (const r of rows ?? []) {
      result[r.id as string] = r.auth_user_id ? (byAuthId.get(r.auth_user_id as string) ?? null) : null;
    }
    return result;
  });

/**
 * Platform admin only: makes a one-time sign-in link for a user, to hand over
 * by WhatsApp / copy-paste.
 *
 *   kind "magic" — signs the user straight in. Their password is untouched.
 *   kind "reset" — signs the user in AND makes the app ask them to choose a new
 *                  password right away (same screen as first sign-in). Any
 *                  device they are signed in on is signed out.
 *
 * Staff accounts use a made-up login address (<id>@login.centring.local), so
 * there is no mailbox to email — the link is created here and shared by hand.
 * Only the hashed one-time token leaves this function; the browser builds the
 * full address from it (see /auth/link). The token is single-use and expires
 * (Supabase → Auth → "Email OTP expiration").
 */
export const createLoginLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), kind: z.enum(["magic", "reset"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const h = await import("./helpers.server");
    await h.requireSuperAdmin(context as unknown as UserContext);
    const caller = await h.getCaller(context as unknown as UserContext);
    const target = await h.loadTarget(caller, data.id);

    if (!target.active) throw new Error("This account is deactivated. Activate it first.");
    if (!target.auth_user_id) throw new Error("This user has no login yet — save them with a mobile number first");

    const admin = await h.adminClient();
    const { data: authUser, error: userError } = await admin.auth.admin.getUserById(target.auth_user_id);
    const loginEmail = authUser?.user?.email;
    if (userError || !loginEmail) throw new Error(userError?.message ?? "Unable to find this user's login");

    const type = data.kind === "reset" ? "recovery" : "magiclink";
    const { data: link, error } = await admin.auth.admin.generateLink({ type, email: loginEmail });
    const tokenHash = link?.properties?.hashed_token;
    if (error || !tokenHash) throw new Error(error?.message ?? "Unable to create the link");

    if (data.kind === "reset") {
      // They must pick a new password after using the link, and any signed-in device is dropped.
      const { error: rowError } = await admin
        .from("workers")
        .update({ must_set_password: true, session_token: null })
        .eq("id", target.id);
      if (rowError) throw new Error(rowError.message);
    }

    return { tokenHash, type, name: target.name, phone: target.phone };
  });