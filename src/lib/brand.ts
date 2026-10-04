/**
 * Name of the platform itself — shown on the sign-in screen, the landing
 * page and browser tab titles, i.e. anywhere no business is known yet.
 * Everything that belongs to ONE business (name, logo, receipts, WhatsApp
 * messages…) comes from that business's row instead — see lib/auth/session.tsx.
 */
/** The name is split in two so the title can be two-toned: "Plinth" in black, "ora" in green (see BrandName). */
export const PLATFORM_NAME_PARTS = ["Plinth", "ora"] as const;
export const PLATFORM_NAME: string = PLATFORM_NAME_PARTS.join("");
export const PLATFORM_TAGLINE =
  "The foundation for your rental business — rentals, returns, payments and worker records in one place.";

/**
 * Platform contact details, shown on the "Need access?" dialog.
 * Leave a value empty ("") to hide that option.
 */
export const CONTACT_EMAIL = "plinthoraapp@gmail.com";
/** Full Instagram profile link — CONFIRM this is your real handle. */
export const CONTACT_INSTAGRAM_URL = "https://www.instagram.com/mbs_centrings_nereducherla";
/** WhatsApp number with country code, digits only, e.g. "919876543210". */
export const CONTACT_WHATSAPP = "";