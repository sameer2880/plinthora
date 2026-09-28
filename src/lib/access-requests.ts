/**
 * Shared (browser-safe) pieces of the "Need access?" flow: the request types and
 * statuses, the row shape the platform admin sees, and the WhatsApp message.
 */
import { PLATFORM_NAME } from "@/lib/brand";

export const REQUEST_TYPES = ["new_business", "app_access", "forgot_credentials"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = ["new", "account_created", "notified", "closed"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  new_business: "New business",
  app_access: "App access",
  forgot_credentials: "Forgot credentials",
};

export const REQUEST_TYPE_HINT: Record<RequestType, string> = {
  new_business: "Register my business on the platform",
  app_access: "Join a business that already uses the app",
  forgot_credentials: "I can't sign in — username or password lost",
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  new: "New",
  account_created: "Account ready",
  notified: "WhatsApp sent",
  closed: "Closed",
};

/** An existing login that uses the requester's mobile number (found on the server). */
export interface RequestAccount {
  id: string;
  username: string | null;
  email: string | null;
  role: string;
  active: boolean;
  business_name: string | null;
}

export interface AccessRequestRow {
  id: string;
  created_at: string;
  request_type: RequestType;
  name: string;
  phone: string;
  business_name: string | null;
  message: string | null;
  status: RequestStatus;
  handled_at: string | null;
  admin_note: string | null;
  account: RequestAccount | null;
}

/** What creating/resetting an account from a request gives back, for the WhatsApp message. */
export interface AccountResult {
  kind: "created" | "reset";
  username: string | null;
  email: string | null;
  phone: string;
  businessName: string | null;
}

/** e.g. "Ravi Kumar" + 9876543210 -> "ravikumar3210". Only a suggestion the admin can edit. */
export function suggestUsername(name: string, phone: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  return base ? `${base}${phone.slice(-4)}` : "";
}

/**
 * The login details message. People can sign in with their mobile number, so when
 * no username was set the mobile number is what we give as the username.
 */
export function buildAccountMessage(input: {
  name: string;
  phone: string;
  username?: string | null;
  businessName?: string | null;
  kind: "created" | "reset";
  isNewBusiness?: boolean;
  appUrl: string;
}) {
  const login = input.username?.trim() || input.phone;
  const intro =
    input.kind === "reset"
      ? `Your ${PLATFORM_NAME} password has been reset.`
      : input.isNewBusiness && input.businessName
        ? `Your business "${input.businessName}" is set up on ${PLATFORM_NAME} and your admin account is ready.`
        : `Your ${PLATFORM_NAME} account is ready.`;

  return [
    `Hello ${input.name.trim()},`,
    "",
    intro,
    "",
    ...(input.businessName && !input.isNewBusiness ? [`Business: ${input.businessName}`] : []),
    `Username: ${login}`,
    `Password: ${input.phone} (your mobile number)`,
    "",
    `Sign in: ${input.appUrl}`,
    "You'll be asked to choose your own new password right after you sign in.",
  ].join("\n");
}