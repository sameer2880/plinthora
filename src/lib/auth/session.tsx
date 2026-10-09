import { createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_NAME } from "@/lib/brand";

/** "super_admin" = the platform admin who creates businesses. */
export type AppRole = "super_admin" | "admin" | "manager" | "worker";

export interface Business {
  id: string;
  name: string;
  short_name: string | null;
  location: string | null;
  owner_line: string | null;
  phone: string | null;
  whatsapp: string | null;
  logo_url: string | null;
  stamp_url: string | null;
  signature_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  maps_url: string | null;
  active: boolean;
  /** Which optional pages the platform admin has turned on for this business. See lib/features.ts. */
  enabled_pages: string[];
}

export interface Me {
  userId: string;
  role: AppRole;
  /** The user's row in `workers`; null for the platform admin. */
  workerId: string | null;
  name: string;
  signatureUrl: string | null;
  mustSetPassword: boolean;
  sessionToken: string | null;
}

export interface SessionState {
  me: Me | null;
  business: Business | null;
}

export type LoadResult =
  | { ok: true; state: SessionState }
  | { ok: false; reason: "no-session" | "inactive" | "error"; message: string };

const BUSINESS_COLUMNS =
  "id, name, short_name, location, owner_line, phone, whatsapp, logo_url, stamp_url, signature_url, website_url, instagram_url, youtube_url, maps_url, active, enabled_pages";

/* ------------------------------------------------------------------ */
/* Module-level snapshot.                                              */
/* Non-React helpers (message templates, access checks) read it; the   */
/* Gate refreshes it whenever the session is (re)loaded.               */
/* ------------------------------------------------------------------ */
let snapshot: SessionState = { me: null, business: null };

export function setSessionSnapshot(next: SessionState) {
  snapshot = next;
}
export function getMe() {
  return snapshot.me;
}
export function getBusiness() {
  return snapshot.business;
}

/** "M.B.S CENTRING WORKS, Nereducherla" — used in WhatsApp messages and receipts. */
export function businessLabel(): string {
  const b = snapshot.business;
  if (!b) return PLATFORM_NAME;
  return b.location ? `${b.name}, ${b.location}` : b.name;
}

/* ------------------------------------------------------------------ */
/* React context                                                       */
/* ------------------------------------------------------------------ */
export const SessionContext = createContext<SessionState>({ me: null, business: null });

export function useSession() {
  return useContext(SessionContext);
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */
/**
 * Works out who is signed in, what they are allowed to be, and which business
 * they are working in. Everything comes from the database under the user's own
 * session (row-level security), so it cannot be spoofed from the browser.
 */
export async function loadSessionState(): Promise<LoadResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, reason: "no-session", message: "" };

  const [superRes, workerRes, businessIdRes] = await Promise.all([
    supabase.rpc("is_super_admin"),
    supabase
      .from("workers")
      .select("id, name, role, active, must_set_password, session_token, signature_url")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    supabase.rpc("my_business_id"),
  ]);

  if (superRes.error || workerRes.error || businessIdRes.error) {
    return {
      ok: false,
      reason: "error",
      message: (superRes.error ?? workerRes.error ?? businessIdRes.error)?.message ?? "Unable to load your account",
    };
  }

  const isSuper = superRes.data === true;
  const worker = workerRes.data;
  const businessId = businessIdRes.data as string | null;

  if (!isSuper && (!worker || !worker.active)) {
    return { ok: false, reason: "inactive", message: "This account is deactivated, or it was signed in on another device" };
  }

  let business: Business | null = null;
  if (businessId) {
    const { data, error } = await supabase.from("businesses").select(BUSINESS_COLUMNS).eq("id", businessId).maybeSingle();
    if (error) return { ok: false, reason: "error", message: error.message };
    business = (data as Business | null) ?? null;
  }
  if (!isSuper && !business) {
    return { ok: false, reason: "inactive", message: "This business is not active. Please contact the platform admin." };
  }

  const me: Me = isSuper
    ? {
        userId: user.id,
        role: "super_admin",
        workerId: null,
        name: (user.user_metadata?.name as string | undefined) ?? user.email ?? "Platform admin",
        signatureUrl: null,
        mustSetPassword: false,
        sessionToken: null,
      }
    : {
        userId: user.id,
        role: worker!.role as AppRole,
        workerId: worker!.id,
        name: worker!.name,
        signatureUrl: worker!.signature_url,
        mustSetPassword: worker!.must_set_password,
        sessionToken: worker!.session_token,
      };

  return { ok: true, state: { me, business } };
}