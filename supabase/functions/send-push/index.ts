// send-push — turns a new activity_log row into a phone notification.
//
// Flow: someone adds / edits / deletes something -> a trigger writes a row to
// activity_log -> a Database Webhook calls this function -> it sends a Firebase
// Cloud Messaging (FCM) push -> Android shows it in the notification center, even if
// the app is closed.
//
// Who gets what:
//   admin   -> everything (except their own actions)
//   manager -> rentals only (except their own actions)
//   worker  -> only when THEIR OWN attendance is marked / changed
//
// Secrets needed (Supabase -> Edge Functions -> Secrets):
//   FIREBASE_SERVICE_ACCOUNT  the whole service-account JSON from Firebase
//   PUSH_WEBHOOK_SECRET       any long random text; the webhook sends it as header x-webhook-secret
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHANNEL_ID = "plinthora_activity"; // must match MainActivity.java + AndroidManifest.xml
const SOUND = "ting"; // res/raw/ting.wav in the Android app

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
function serviceAccount(): ServiceAccount {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT secret is not set");
  return JSON.parse(raw);
}

/* ------------------------- Google OAuth for FCM ------------------------- */

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

let cached: { token: string; expires: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expires - 60 > now) return cached.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google token error: ${JSON.stringify(json)}`);
  cached = { token: json.access_token, expires: now + (json.expires_in ?? 3600) };
  return cached.token;
}

/* ------------------------------ message text ---------------------------- */

const ENTITY: Record<string, string> = {
  rental: "a rental",
  diary: "a diary note",
  attendance: "attendance",
  payment: "a payment",
  feedback: "feedback",
};

/* --------------------------------- handler ------------------------------ */

Deno.serve(async (req) => {
  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: { type?: string; table?: string; record?: Record<string, string | null> };
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const rec = payload.record;
  if (payload.type !== "INSERT" || payload.table !== "activity_log" || !rec?.business_id) {
    return Response.json({ skipped: true });
  }

  type Target = { userIds: string[]; title: string; body: string };
  const targets: Target[] = [];

  const entity = rec.entity ?? "";
  const actorName = rec.actor_name ?? "Someone";
  const staffTitle = `${actorName} ${rec.action ?? "changed"} ${ENTITY[entity] ?? entity ?? "something"}`;
  const staffBody = rec.summary ?? "";

  // 1) Staff: admins hear about everything, managers only about rentals.
  const roles = entity === "rental" ? ["admin", "manager"] : ["admin"];
  const { data: staff, error: staffErr } = await sb
    .from("workers")
    .select("auth_user_id")
    .eq("business_id", rec.business_id)
    .eq("active", true)
    .in("role", roles);
  if (staffErr) return new Response(staffErr.message, { status: 500 });

  const staffIds = (staff ?? [])
    .map((s) => s.auth_user_id as string | null)
    .filter((id): id is string => !!id && id !== rec.actor_user_id);
  if (staffIds.length > 0) targets.push({ userIds: staffIds, title: staffTitle, body: staffBody });

  // 2) Attendance: also tell that one worker (never other workers).
  if (entity === "attendance" && rec.target_user_id && rec.target_user_id !== rec.actor_user_id) {
    const { data: w } = await sb
      .from("workers")
      .select("auth_user_id")
      .eq("business_id", rec.business_id)
      .eq("auth_user_id", rec.target_user_id)
      .eq("active", true)
      .eq("role", "worker")
      .maybeSingle();
    if (w?.auth_user_id) {
      const title =
        rec.action === "deleted"
          ? "Attendance removed"
          : rec.action === "modified"
            ? "Attendance updated"
            : "Attendance marked";
      targets.push({
        userIds: [w.auth_user_id as string],
        title,
        body: rec.detail || "Your attendance was updated.",
      });
    }
  }

  if (targets.length === 0) return Response.json({ sent: 0 });

  const allUserIds = [...new Set(targets.flatMap((t) => t.userIds))];
  const { data: tokens, error: tokErr } = await sb
    .from("push_tokens")
    .select("token, user_id")
    .eq("business_id", rec.business_id)
    .in("user_id", allUserIds);
  if (tokErr) return new Response(tokErr.message, { status: 500 });
  if (!tokens || tokens.length === 0) return Response.json({ sent: 0 });

  const sa = serviceAccount();
  const bearer = await accessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  let sent = 0;
  const dead: string[] = [];

  const messages = targets.flatMap((t) =>
    tokens
      .filter((tk) => t.userIds.includes(tk.user_id as string))
      .map((tk) => ({ token: tk.token as string, title: t.title, body: t.body })),
  );

  await Promise.all(
    messages.map(async ({ token, title, body }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: {
              activity_id: String(rec.id ?? ""),
              entity: String(rec.entity ?? ""),
              action: String(rec.action ?? ""),
            },
            android: {
              priority: "HIGH",
              notification: { channel_id: CHANNEL_ID, sound: SOUND },
            },
          },
        }),
      });
      if (res.ok) {
        sent++;
        return;
      }
      const text = await res.text();
      // The phone uninstalled the app or the token expired: forget it.
      if (res.status === 404 || text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT")) {
        dead.push(token);
      } else {
        console.error("FCM error", res.status, text);
      }
    }),
  );

  if (dead.length > 0) await sb.from("push_tokens").delete().in("token", dead);

  return Response.json({ sent, removed: dead.length });
});