import { supabase } from "@/integrations/supabase/client";
import { DEVICE_TOKEN_KEY } from "@/lib/auth/identity";
import { setSessionSnapshot } from "@/lib/auth/session";
import { unregisterNativePush } from "@/lib/native-push";
import { stopNativeLocation } from "@/lib/native-location";

/**
 * Signs out, forgets this device's token and reloads.
 *
 * Lives in its own small module (not in gate.tsx) so buttons anywhere in the
 * app can import it without pulling in the whole Gate component — that keeps
 * the import graph free of cycles and hot-reload friendly.
 */
export function lock() {
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  setSessionSnapshot({ me: null, business: null });
  // Stop phone notifications for this account first (needs the session, so before sign-out).
  // Same for background location: stop the phone's tracking service and revoke its token.
  void Promise.allSettled([unregisterNativePush(), stopNativeLocation()])
    .then(() => supabase.auth.signOut())
    .finally(() => window.location.reload());
}