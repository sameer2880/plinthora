import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALL_FEATURE_KEYS } from "@/lib/features";
import {
  REQUEST_STATUSES,
  REQUEST_TYPES,
  type AccessRequestRow,
  type AccountResult,
} from "@/lib/access-requests";
import { emailSchema, phoneSchema, usernameSchema, type UserContext } from "./schemas";

/**
 * "Need access?" requests.
 *
 *  - submitAccessRequestFn  PUBLIC (nobody is signed in on the sign-in page). Validated,
 *                           honeypot-checked and rate-limited before anything is stored.
 *  - everything else        PLATFORM ADMIN ONLY (checked from the caller's own session).
 *
 * The table has no client policies; only these server functions touch it.
 */

type Db = { from: (table: string) => any };
const requests = (admin: unknown) => (admin as Db).from("access_requests");

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_PHONE_PER_DAY = 3;
const MAX_PER_HOUR_OVERALL = 200;

/* ------------------------------------------------------------------ */
/* Public: send a request                                              */
/* ------------------------------------------------------------------ */

const submitSchema = z
  .object({
    request_type: z.enum(REQUEST_TYPES),
    name: z.string().trim().min(2, "Enter your name").max(120),
    phone: phoneSchema,
    business_name: z.string().trim().max(120).optional(),
    message: z.string().trim().max(500, "Message is too long").optional(),
    /** Honeypot: hidden in the form, so only bots fill it in. */
    website: z.string().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.request_type === "new_business" && !v.business_name) {
      ctx.addIssue({ code: "custom", path: ["business_name"], message: "Enter your business name" });
    }
  });

export const submitAccessRequestFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.website) return { ok: true as const }; // bot: pretend it worked

    const h = await import("./helpers.server");
    const admin = await h.adminClient();

    const dayAgo = new Date(Date.now() - DAY_MS).toISOString();
    const hourAgo = new Date(Date.now() - DAY_MS / 24).toISOString();

    const [{ count: samePhone }, { count: overall }, { data: duplicate }] = await Promise.all([
      requests(admin).select("id", { count: "exact", head: true }).eq("phone", data.phone).gte("created_at", dayAgo),
      requests(admin).select("id", { count: "exact", head: true }).gte("created_at", hourAgo),
      requests(admin)
        .select("id")
        .eq("phone", data.phone)
        .eq("request_type", data.request_type)
        .eq("status", "new")
        .limit(1),
    ]);

    // Same request already waiting: treat as sent, don't pile up duplicates.
    if (Array.isArray(duplicate) && duplicate.length > 0) return { ok: true as const };
    if ((samePhone ?? 0) >= MAX_PER_PHONE_PER_DAY) {
      throw new Error("You've already sent a few requests today. We'll contact you on your mobile number soon.");
    }
    if ((overall ?? 0) >= MAX_PER_HOUR_OVERALL) {
      throw new Error("We're receiving a lot of requests right now. Please try again in a little while.");
    }

    const { error } = await requests(admin).insert({
      request_type: data.request_type,
      name: data.name,
      phone: data.phone,
      business_name: data.business_name || null,
      message: data.message || null,
    });
    if (error) throw new Error("Unable to send your request right now. Please try again.");
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ */
/* Platform admin: list / update / delete                              */
/* ------------------------------------------------------------------ */

export const listAccessRequestsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessRequestRow[]> => {
    const h = await import("./helpers.server");
    await h.requireSuperAdmin(context as unknown as UserContext);
    const admin = await h.adminClient();

    const { data: rows, error } = await requests(admin)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Omit<AccessRequestRow, "account">[];
    if (list.length === 0) return [];

    // Is there already a login using each mobile number? (Shown on the card, and used
    // to offer "reset password" instead of "create account".)
    const phones = [...new Set(list.map((r) => r.phone))];
    const { data: workers } = await admin
      .from("workers")
      .select("id, phone, username, email, role, active, business_id")
      .not("auth_user_id", "is", null)
      .in("phone", phones);

    const businessIds = [...new Set((workers ?? []).map((w) => w.business_id as string))];
    const { data: businesses } = businessIds.length
      ? await admin.from("businesses").select("id, name").in("id", businessIds)
      : { data: [] as { id: string; name: string }[] };
    const businessName = new Map((businesses ?? []).map((b) => [b.id as string, b.name as string]));
    const byPhone = new Map((workers ?? []).map((w) => [w.phone as string, w]));

    return list.map((r) => {
      const w = byPhone.get(r.phone);
      return {
        ...r,
        account: w
          ? {
              id: w.id as string,
              username: (w.username as string | null) ?? null,
              email: (w.email as string | null) ?? null,
              role: w.role as string,
              active: w.active as boolean,
              business_name: businessName.get(w.business_id as string) ?? null,
            }
          : null,
      };
    });
  });

export const updateAccessRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(REQUEST_STATUSES).optional(),
        admin_note: z.string().trim().max(500).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const h = await import("./helpers.server");
    await h.requireSuperAdmin(context as unknown as UserContext);
    const admin = await h.adminClient();

    const patch: Record<string, unknown> = {};
    if (data.status) {
      patch.status = data.status;
      patch.handled_at = data.status === "new" ? null : new Date().toISOString();
    }
    if (data.admin_note !== undefined) patch.admin_note = data.admin_note || null;

    const { error } = await requests(admin).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteAccessRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const h = await import("./helpers.server");
    await h.requireSuperAdmin(context as unknown as UserContext);
    const admin = await h.adminClient();
    const { error } = await requests(admin).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ */
/* Platform admin: create the account (or reset it) for a request      */
/* ------------------------------------------------------------------ */

/**
 * Turns a request into a working login whose first password is the requester's mobile
 * number (they must choose their own at first sign-in):
 *
 *  - a login already uses this mobile number and `resetExisting` is set
 *      -> its password is reset to the mobile number
 *  - "new business" request  -> creates the business and its first admin
 *  - anything else           -> creates a user in the chosen business
 *
 * Returns what the WhatsApp message needs. The request is marked "account ready".
 */
export const createAccountFromRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        resetExisting: z.boolean().default(false),
        businessName: z.string().trim().max(120).optional(), // new business
        businessId: z.string().uuid().optional(), // existing business
        role: z.enum(["worker", "manager", "admin"]).default("worker"),
        username: usernameSchema,
        email: emailSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AccountResult> => {
    const h = await import("./helpers.server");
    await h.requireSuperAdmin(context as unknown as UserContext);
    const admin = await h.adminClient();

    const { data: request } = await requests(admin).select("*").eq("id", data.id).maybeSingle();
    if (!request) throw new Error("Request not found");
    const phone = request.phone as string;
    const name = request.name as string;

    const markReady = async () => {
      await requests(admin)
        .update({ status: "account_created", handled_at: new Date().toISOString() })
        .eq("id", data.id);
    };

    // A login already uses this mobile number.
    const { data: existing } = await admin
      .from("workers")
      .select("id, business_id, username, email, active, auth_user_id")
      .eq("phone", phone)
      .not("auth_user_id", "is", null)
      .limit(1);
    const found = existing?.[0];

    if (found) {
      if (!data.resetExisting) {
        throw new Error("An account already exists for this mobile number. Use “Reset password” instead.");
      }
      if (!found.active) throw new Error("This account is deactivated. Activate it on the Users page first.");

      const { error } = await admin.auth.admin.updateUserById(found.auth_user_id as string, { password: phone });
      if (error) throw new Error(error.message);
      const { error: rowError } = await admin
        .from("workers")
        .update({ must_set_password: true, session_token: null })
        .eq("id", found.id as string);
      if (rowError) throw new Error(rowError.message);

      const { data: biz } = await admin.from("businesses").select("name").eq("id", found.business_id as string).maybeSingle();
      await markReady();
      return {
        kind: "reset",
        username: (found.username as string | null) ?? null,
        email: (found.email as string | null) ?? null,
        phone,
        businessName: (biz?.name as string | undefined) ?? null,
      };
    }

    const username = h.cleanUsername(data.username);
    const email = h.cleanEmail(data.email);

    /* ---- a brand-new business + its admin ---- */
    if (request.request_type === "new_business") {
      const businessName = (data.businessName || (request.business_name as string | null) || "").trim();
      if (businessName.length < 2) throw new Error("Business name is required");

      const { data: business, error } = await admin
        .from("businesses")
        .insert({ name: businessName, enabled_pages: ALL_FEATURE_KEYS })
        .select("id")
        .single();
      if (error || !business) throw new Error(error?.message ?? "Unable to create the business");

      try {
        await h.provisionUser({
          businessId: business.id as string,
          name,
          phone,
          email,
          username,
          role: "admin",
          daily_wage: 0,
        });
      } catch (e) {
        await admin.from("businesses").delete().eq("id", business.id);
        throw e;
      }
      await markReady();
      return { kind: "created", username, email, phone, businessName };
    }

    /* ---- a user in an existing business ---- */
    if (!data.businessId) throw new Error("Choose a business");
    const { data: biz } = await admin.from("businesses").select("id, name").eq("id", data.businessId).maybeSingle();
    if (!biz) throw new Error("Business not found");

    await h.provisionUser({
      businessId: biz.id as string,
      name,
      phone,
      email,
      username,
      role: data.role,
      daily_wage: 0,
    });
    await markReady();
    return { kind: "created", username, email, phone, businessName: biz.name as string };
  });