import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public on purpose: this powers the "Share receipt" WhatsApp links, which a
 * customer opens without ever signing in. It only ever returns what already
 * prints on a receipt (rental line items + the business's public letterhead
 * fields) — never login-only data like usernames, worker records, etc.
 *
 * Safety of the link: the id is a random UUID (122 bits), so it can't be guessed
 * or counted through; the link itself is the key. On top of that this function
 * only returns the fields a receipt prints (no internal ids such as who created
 * it or which business row it belongs to), answers "not found" the same way for
 * every miss, and is rate limited per IP address so scanning is pointless.
 */
const RECEIPT_COLUMNS =
  "id, group_id, customer_name, customer_phone, customer_address, material_name, quantity, unit, rate_per_unit, total_amount, security_deposit, issue_date, return_date, status, payment_status, notes, created_at, updated_at";

export const getPublicReceiptFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const h = await import("./helpers.server");
    const admin = await h.adminClient();

    if (!(await h.withinRateLimit(`receipt:ip:${h.clientIp()}`, 120, 600))) {
      throw new Error("Too many requests. Please try again in a few minutes.");
    }

    const { data: rental, error } = await admin.from("rentals").select(RECEIPT_COLUMNS).eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!rental) return null;

    const groupId = (rental as { group_id: string | null }).group_id;
    const { data: rows, error: rowsError } = groupId
      ? await admin.from("rentals").select(RECEIPT_COLUMNS).eq("group_id", groupId).order("created_at", { ascending: true })
      : { data: [rental], error: null };
    if (rowsError) throw new Error(rowsError.message);

    const { data: owner } = await admin.from("rentals").select("business_id").eq("id", data.id).maybeSingle();
    const businessId = (owner as { business_id: string | null } | null)?.business_id ?? null;
    let business: {
      name: string;
      location: string | null;
      owner_line: string | null;
      phone: string | null;
      logo_url: string | null;
      stamp_url: string | null;
      signature_url: string | null;
    } | null = null;
    if (businessId) {
      const { data: b, error: bError } = await admin
        .from("businesses")
        .select("name, location, owner_line, phone, logo_url, stamp_url, signature_url")
        .eq("id", businessId)
        .maybeSingle();
      if (bError) throw new Error(bError.message);
      business = b;
    }

    return {
      rows: ((rows ?? [rental]) as unknown as Record<string, unknown>[]).map((r) => ({ ...r, created_by: null })),
      business,
    };
  });