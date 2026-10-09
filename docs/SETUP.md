# Setup

## 1. Get the project running

1. Install [Node.js](https://nodejs.org) 20 or newer.
2. In the project folder run `npm install`.
3. Copy `.env.example` to `.env` (same folder as `package.json`) and fill in the values from
   Supabase → Project Settings → API Keys. The secret key goes in `SUPABASE_SERVICE_ROLE_KEY`.

## 2. Create the database (new, empty Supabase project)

Open Supabase → **SQL Editor → New query**, paste the whole of `supabase/manual/setup-database.sql`
and click **Run** — once. (It is every file in `supabase/migrations`, in order.)
You should see "Success". If anything fails nothing is saved, so you can fix it and run it again.

*Using the Supabase CLI instead:* `npx supabase link --project-ref <ref>` then `npx supabase db push`.

## 3. Create the platform admin

```bash
node --env-file=.env scripts/bootstrap.mjs super-admin you@example.com "a-strong-password" \
  --name "Your Name" --username yourhandle --phone 9876543210
```

`--name`, `--username` and `--phone` are optional; add them if you want to sign in with a mobile number
or username as well as your email. Re-run the command any time to change them (the password is left alone).

## 4. Lock the database

In the SQL Editor run `supabase/manual/lockdown.sql`. It removes all anonymous access and refuses to run
if no platform admin exists yet — that's why step 3 comes first.

## 5. Sign in and add your businesses

`npm run dev`, open the address it prints, sign in as the platform admin, then **Businesses → Add business**
(name plus the business's first admin). That admin signs in with their mobile number, email or username;
they receive a one-time link and choose their own password when they open it.
They then add their managers and workers under **Manage Users**.

> The migration also creates one starter business, "M.B.S CENTRING WORKS". Rename it from
> Businesses → Edit, or delete it if you don't want it.

## Upgrading a project that already has an earlier version

If you already ran an older setup, don't run `setup-database.sql` again. Run only the migration files newer
than the last one you applied (in order) — for the platform-admin console that is
`supabase/migrations/20260922000000_platform_admin_console.sql`. Then re-run step 3 to add your profile
fields, and users you created with an older build must be deleted and added again.

## Going live

Add the five variables from `.env` to your host's environment settings and redeploy (build with `npm run build`).
Old browser sessions are not valid after a switch — everyone signs in once more.

## Moving data from an older project

Import the old data **before** applying `20260920000000_multi_business.sql` (apply the migrations up to
`20260908000000` first), then apply the rest, run `node --env-file=.env scripts/bootstrap.mjs migrate-users`
so every existing person gets a login, and finish with `lockdown.sql`.
