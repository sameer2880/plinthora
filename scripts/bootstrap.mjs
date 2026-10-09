#!/usr/bin/env node
/**
 * One-off admin tasks for the multi-business rollout. Needs the SERVICE ROLE
 * key (never put it in the browser bundle) — run it from your own machine:
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/bootstrap.mjs migrate-users
 *
 *   node scripts/bootstrap.mjs super-admin you@example.com 'a-strong-password' \
 *        --name "Your Name" --username yourhandle --phone 9876543210
 *
 * (Node 20+: you can also put the two variables in a file and use
 *  `node --env-file=.env scripts/bootstrap.mjs ...`)
 *
 * migrate-users : gives every existing `workers` row a real Supabase Auth
 *                 account (they sign in with mobile number, email or username). Users keep the
 *                 password they had if it is 6+ characters; otherwise they get a
 *                 random password and need a one-time link from Manage Users
 *                 (Send reset link) to get in and choose their own. Safe to re-run.
 * super-admin   : creates (or updates) the platform "default admin" — the account
 *                 that adds/manages/deletes businesses and manages their users
 *                 (it never sees a business's own data). --name/--username/--phone
 *                 are optional; with them the platform admin can sign in with
 *                 mobile number or username as well as email. Re-run it any time
 *                 to change those (the password is left alone).
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

/** Long random password (letters, digits, symbols) for accounts that have no usable password yet. */
const randomPassword = () => `Aa1!${randomBytes(24).toString("base64url")}`;

// Must match AUTH_EMAIL_DOMAIN in src/lib/auth/identity.ts
const AUTH_EMAIL_DOMAIN = "login.centring.local";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Each staff/worker account signs in to Supabase Auth as "<workers.id>@<domain>".
// People type their mobile number / email / username; the app looks up which account that is.
const workerAuthEmail = (workerId) => `${workerId}@${AUTH_EMAIL_DOMAIN}`;

async function findUserByEmail(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function migrateUsers() {
  // The plain-text `password` column is dropped by lockdown.sql — cope with it being gone.
  let { data: rows, error } = await admin
    .from("workers")
    .select("id, name, phone, password, active, business_id, role, must_set_password")
    .is("auth_user_id", null);
  if (error && /password/i.test(error.message)) {
    ({ data: rows, error } = await admin
      .from("workers")
      .select("id, name, phone, active, business_id, role, must_set_password")
      .is("auth_user_id", null));
  }
  if (error) throw error;

  let created = 0;
  let linked = 0;
  const skipped = [];

  for (const row of rows) {
    const phone = (row.phone ?? "").trim();
    if (!/^\d{10}$/.test(phone)) {
      skipped.push(`${row.name} (${row.role}) — no valid 10-digit mobile number`);
      continue;
    }
    const email = workerAuthEmail(row.id);
    const legacy = (row.password ?? "").trim();
    const keepsOwnPassword = legacy.length >= 6 && legacy !== phone;
    const password = keepsOwnPassword ? legacy : randomPassword();
    const mustSetPassword = !keepsOwnPassword || row.must_set_password === true;

    let user;
    const res = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      ban_duration: row.active ? "none" : "876000h",
      user_metadata: { name: row.name, business_id: row.business_id, role: row.role },
    });
    if (res.error) {
      user = await findUserByEmail(email);
      if (!user) {
        skipped.push(`${row.name} — ${res.error.message}`);
        continue;
      }
      linked++;
    } else {
      user = res.data.user;
      created++;
    }

    const { error: upErr } = await admin
      .from("workers")
      .update({ auth_user_id: user.id, must_set_password: mustSetPassword })
      .eq("id", row.id);
    if (upErr) skipped.push(`${row.name} — ${upErr.message}`);
  }

  console.log(`Accounts created: ${created}, linked to an existing account: ${linked}`);
  if (skipped.length) {
    console.log("Skipped (fix these rows, then re-run):");
    for (const s of skipped) console.log("  - " + s);
  }
}

async function superAdmin(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
    else positional.push(argv[i]);
  }
  const [email, password] = positional;
  if (!email || !email.includes("@")) {
    throw new Error('Usage: super-admin <email> <password> [--name "Full Name"] [--username handle] [--phone 9876543210]');
  }
  const phone = flags.phone?.trim();
  const username = flags.username?.trim().toLowerCase();
  if (phone && !/^[6789]\d{9}$/.test(phone)) throw new Error("--phone must be a 10-digit mobile number starting with 6, 7, 8 or 9");
  if (username && (!/^[a-z0-9._-]+$/.test(username) || /^\d+$/.test(username))) {
    throw new Error("--username can use letters, numbers, dot, dash and underscore, and can't be only numbers");
  }

  // The platform admin must not share a mobile number / username with a business user.
  if (phone) {
    const { data } = await admin.from("workers").select("id").eq("phone", phone).limit(1);
    if (data?.length) throw new Error("That mobile number already belongs to a business user.");
  }
  if (username) {
    const { data } = await admin.from("workers").select("id").ilike("username", username).limit(1);
    if (data?.length) throw new Error("That username already belongs to a business user.");
  }

  let user = await findUserByEmail(email);
  if (!user) {
    if (!password || password.length < 8) throw new Error("Choose a password of at least 8 characters.");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: flags.name || "Platform admin" },
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created account ${email}`);
  } else {
    console.log(`Account ${email} already exists — updating its platform-admin profile (password unchanged).`);
    if (flags.name) await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, name: flags.name } });
  }

  const profile = { user_id: user.id, email };
  if (flags.name) profile.name = flags.name;
  else if (!user.user_metadata?.name) profile.name = "Platform admin";
  if (phone) profile.phone = phone;
  if (username) profile.username = username;
  const { error } = await admin.from("platform_admins").upsert(profile, { onConflict: "user_id" });
  if (error) throw error;

  console.log("Done. Sign in with your email" + (phone ? ", mobile number" : "") + (username ? " or username" : "") + " plus your password.");
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === "migrate-users") await migrateUsers();
  else if (cmd === "super-admin") await superAdmin(args);
  else {
    console.log("Commands: migrate-users | super-admin <email> <password>");
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
