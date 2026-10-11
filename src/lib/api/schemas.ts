/**
 * Client-safe pieces shared by the server functions: input validation (zod) and types.
 * Nothing in here touches the database, so it can be bundled for the browser.
 */
import { z } from "zod";
import { MOBILE_REGEX } from "@/lib/auth/identity";

export type Role = "worker" | "manager" | "admin";

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */
export const phoneSchema = z
  .string()
  .trim()
  .regex(MOBILE_REGEX, "Mobile number must be 10 digits and start with 6, 7, 8 or 9");

export const emailSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\S+@\S+\.\S+$/.test(v), "Enter a valid email address")
  .optional();

export const usernameSchema = z
  .string()
  .trim()
  .max(40, "Username is too long")
  .refine((v) => /^[A-Za-z0-9._-]*$/.test(v), "Username can use letters, numbers, dot, dash and underscore only")
  .refine((v) => !/^\d+$/.test(v), "Username can't be only numbers")
  .optional();

export const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: phoneSchema,
  email: emailSchema,
  username: usernameSchema,
  role: z.enum(["worker", "manager", "admin"]),
  daily_wage: z.number().min(0).max(1_000_000).default(0),
  wage_day: z.number().min(0).max(1_000_000).optional(),
  wage_half: z.number().min(0).max(1_000_000).optional(),
  wage_full_ot: z.number().min(0).max(1_000_000).optional(),
  wage_ot: z.number().min(0).max(1_000_000).optional(),
  notes: z.string().max(2000).nullish(),
});


export type UserContext = {
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    from: (table: string) => any;
  };
  userId: string;
};

export interface Caller {
  userId: string;
  /** The platform admin — manages businesses and their users, never their data. */
  isSuper: boolean;
  /** "admin" for the platform admin too, so "can manage users" checks stay simple. */
  role: "admin" | "manager";
  /** The caller's own business; null for the platform admin. */
  businessId: string | null;
  workerId: string | null;
}


export interface WorkerRow {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  role: Role;
  active: boolean;
  auth_user_id: string | null;
}