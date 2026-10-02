// location-ping — receives a GPS fix from the Android app's background location service
// (which keeps running when the app is closed) and stores it as the worker's latest position.
//
// The phone sends:  POST { token, latitude, longitude, accuracy_m }
// `token` is the per-phone secret created by register_location_device(). Only its SHA-256
// hash is stored in worker_location_devices, so this function can identify the worker
// without a browser session.
//
// Replies:  200 {ok:true}  saved
//           400            bad request
//           401 {revoked}  unknown token (signed out / removed) -> the phone stops sending
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  let body: { token?: unknown; latitude?: unknown; longitude?: unknown; accuracy_m?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }

  const { token, latitude, longitude, accuracy_m } = body;
  if (typeof token !== "string" || token.length < 32 || token.length > 200) {
    return json(400, { error: "bad token" });
  }
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return json(400, { error: "bad coordinates" });
  }
  const accuracy = typeof accuracy_m === "number" && Number.isFinite(accuracy_m) ? accuracy_m : null;

  const hash = await sha256Hex(token);
  const { data: device, error: deviceError } = await sb
    .from("worker_location_devices")
    .select("worker_id")
    .eq("token_hash", hash)
    .maybeSingle();

  if (deviceError) return json(500, { error: "lookup failed" });
  if (!device) return json(401, { revoked: true });

  // The business_id is filled in by the worker_locations_business_id trigger.
  const { error } = await sb.from("worker_locations").upsert(
    {
      worker_id: device.worker_id,
      latitude,
      longitude,
      accuracy_m: accuracy,
      sharing_enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "worker_id" },
  );
  if (error) return json(500, { error: "save failed" });

  // Best effort, not worth failing the request over.
  void sb
    .from("worker_location_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("token_hash", hash);

  return json(200, { ok: true });
});