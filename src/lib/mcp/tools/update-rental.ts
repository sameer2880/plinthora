import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "update_rental",
  title: "Update rental",
  description:
    "Update an existing rental record — mark it returned/active, change the return date, amount or notes.",
  inputSchema: {
    id: z.string().uuid().describe("Rental record id."),
    status: z.enum(["active", "returned"]).optional(),
    return_date: z.string().nullable().optional().describe("YYYY-MM-DD, or null to clear the expected return date."),
    quantity: z.number().positive().optional(),
    rate_per_unit: z.number().nonnegative().optional(),
    total_amount: z.number().nonnegative().optional(),
    security_deposit: z.number().nonnegative().optional().describe("Advance amount received from the customer."),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, ...patch }) => {
    const changes: Record<string, unknown> = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    // Marking a rental returned defaults the return date to today.
    if (changes.status === "returned" && changes.return_date === undefined) {
      const d = new Date();
      changes.return_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    if (Object.keys(changes).length === 0) throw new ToolError("Provide at least one field to update.");

    const supabase = supabaseAnon();
    const { data, error } = await supabase
      .from("rentals")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError(`No rental found with id ${id}`);

    return {
      content: [{ type: "text", text: `Updated rental ${id}.` }],
      structuredContent: { rental: data },
    };
  },
});