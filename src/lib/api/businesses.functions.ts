import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailSchema, phoneSchema, usernameSchema, type UserContext } from "./schemas";
import { ALL_FEATURE_KEYS } from "@/lib/features";

/**
 * Platform admin only: create a business (with its first admin) and delete one.
 * (Editing a business's details and switching it on/off are plain updates the
 * platform admin is allowed to make directly under row-level security.)
 */

export const createBusinessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2, "Business name is required").max(120),
        short_name: z.string().trim().max(12).optional(),
        location: z.string().trim().max(120).optional(),
        owner_line: z.string().trim().max(200).optional(),
        phone: z.string().trim().max(20).optional(),
        adminName: z.string().trim().min(1, "Admin name is required").max(120),
        adminPhone: phoneSchema,
        adminEmail: emailSchema,
        adminUsername: usernameSchema,
        /** Which optional pages to turn on for this business. Defaults to all of them. */
        enabledPages: z.array(z.enum(ALL_FEATURE_KEYS as [string, ...string[]])).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const h = await import("./helpers.server");
    await h.requireSuperAdmin(context as unknown as UserContext);
    const admin = await h.adminClient();

    const { data: business, error } = await admin
      .from("businesses")
      .insert({
        name: data.name,
        short_name: data.short_name || null,
        location: data.location || null,
        owner_line: data.owner_line || null,
        phone: data.phone || null,
        enabled_pages: data.enabledPages ?? ALL_FEATURE_KEYS,
      })
      .select("id")
      .single();
    if (error || !business) throw new Error(error?.message ?? "Unable to create the business");

    let adminAuthUserId: string;
    try {
      const created = await h.provisionUser({
        businessId: business.id,
        name: data.adminName,
        phone: data.adminPhone,
        email: data.adminEmail,
        username: data.adminUsername,
        role: "admin",
        daily_wage: 0,
      });
      adminAuthUserId = created.authUserId;
    } catch (e) {
      await admin.from("businesses").delete().eq("id", business.id);
      throw e;
    }
    // The first admin gets a one-time invite link (their account starts with a random password).
    let invite: { tokenHash: string; type: "recovery" | "magiclink" } | null = null;
    try {
      invite = await h.createAccessLink(adminAuthUserId, "recovery");
    } catch (e) {
      console.error("[createBusinessFn] business created but the invite link failed:", e);
    }
    return { businessId: business.id as string, invite };
  });

/**
 * Permanently deletes a business: every rental, diary note, worker record and
 * login account it owns, and its uploaded images. The caller must retype the
 * business name. Cannot be undone.
 */
export const deleteBusinessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ businessId: z.string().uuid(), confirmName: z.string().trim().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const h = await import("./helpers.server");
    await h.requireSuperAdmin(context as unknown as UserContext);
    const admin = await h.adminClient();
    const id = data.businessId;

    const { data: business } = await admin.from("businesses").select("id, name").eq("id", id).maybeSingle();
    if (!business) throw new Error("Business not found");
    if (data.confirmName !== business.name.trim()) throw new Error("The name you typed doesn't match this business");

    const { data: users } = await admin.from("workers").select("auth_user_id").eq("business_id", id);

    // Children first (foreign keys), the business itself last.
    const steps: [string, () => PromiseLike<{ error: { message: string } | null }>][] = [
      ["attendance", () => admin.from("worker_attendance").delete().eq("business_id", id)],
      ["payments", () => admin.from("worker_payments").delete().eq("business_id", id)],
      ["feedback", () => admin.from("worker_feedback").delete().eq("business_id", id)],
      ["locations", () => admin.from("worker_locations").delete().eq("business_id", id)],
      ["rentals", () => admin.from("rentals").delete().eq("business_id", id)],
      ["diary notes", () => admin.from("diary_notes").delete().eq("business_id", id)],
      ["users", () => admin.from("workers").delete().eq("business_id", id)],
    ];
    for (const [label, run] of steps) {
      const { error } = await run();
      if (error) throw new Error(`Could not delete the business's ${label}: ${error.message}`);
    }

    for (const u of users ?? []) {
      if (u.auth_user_id) await admin.auth.admin.deleteUser(u.auth_user_id as string);
    }

    try {
      const files = await admin.storage.from("business-assets").list(id);
      const paths = (files.data ?? []).map((f) => `${id}/${f.name}`);
      if (paths.length > 0) await admin.storage.from("business-assets").remove(paths);
    } catch {
      /* leftover images are harmless */
    }

    const { error } = await admin.from("businesses").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });