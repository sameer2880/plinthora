-- ==============================================================
-- ALL-IN-ONE DATABASE SETUP (all migrations, in order)
-- Paste this whole file into Supabase -> SQL Editor and click Run ONCE.
-- Only for a NEW, EMPTY project.
-- ==============================================================

-- ---------- 20260726061719_ab9fa2fc-52f5-45f3-9831-6f15a36eeb42.sql ----------

-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Rentals
CREATE TABLE public.rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT,
  material_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  rate_per_unit NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  security_deposit NUMERIC DEFAULT 0,
  issue_date DATE NOT NULL,
  return_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rentals TO authenticated;
GRANT ALL ON public.rentals TO service_role;
ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rentals_all_authenticated" ON public.rentals FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER rentals_updated_at BEFORE UPDATE ON public.rentals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Handle new user: create profile, first user becomes admin, others manager
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
  assigned_role app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, mobile)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'mobile'
  );

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'manager');
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ---------- 20260726062641_709c6a8c-7332-4cc8-8f66-a3e45096f353.sql ----------
DROP POLICY IF EXISTS rentals_all_authenticated ON public.rentals;
ALTER TABLE public.rentals ALTER COLUMN created_by DROP NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rentals TO anon;
CREATE POLICY rentals_all_public ON public.rentals FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ---------- 20260731093538_77e584f7-7d4a-4714-8f33-542d42062296.sql ----------
CREATE TABLE public.diary_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  amount numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diary_notes TO anon, authenticated;
GRANT ALL ON public.diary_notes TO service_role;
ALTER TABLE public.diary_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY diary_notes_all_public ON public.diary_notes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER diary_notes_updated_at BEFORE UPDATE ON public.diary_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 20260807032229_e1de494c-ba84-4edd-9cb9-94b06a548eb4.sql ----------
CREATE TABLE public.workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  daily_wage numeric not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO anon, authenticated;
GRANT ALL ON public.workers TO service_role;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY workers_all_public ON public.workers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER workers_updated_at BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.worker_attendance (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  work_date date not null,
  present boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, work_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_attendance TO anon, authenticated;
GRANT ALL ON public.worker_attendance TO service_role;
ALTER TABLE public.worker_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY worker_attendance_all_public ON public.worker_attendance FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER worker_attendance_updated_at BEFORE UPDATE ON public.worker_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.worker_payments (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  amount numeric not null default 0,
  note text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_payments TO anon, authenticated;
GRANT ALL ON public.worker_payments TO service_role;
ALTER TABLE public.worker_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY worker_payments_all_public ON public.worker_payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER worker_payments_updated_at BEFORE UPDATE ON public.worker_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 20260807033358_9b873a1b-3279-4959-bfdd-bc6c4b94d232.sql ----------
ALTER TABLE public.worker_attendance
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'present';

UPDATE public.worker_attendance SET status = CASE WHEN present THEN 'present' ELSE 'absent' END;

ALTER TABLE public.worker_attendance
  ADD CONSTRAINT worker_attendance_status_check CHECK (status IN ('present','absent','holiday'));

ALTER TABLE public.worker_attendance
  ADD CONSTRAINT worker_attendance_worker_date_unique UNIQUE (worker_id, work_date);

-- ---------- 20260808031608_9bafbaa1-083f-468b-91d8-3abf0ad2c6bf.sql ----------
ALTER TABLE public.worker_attendance
  ADD COLUMN IF NOT EXISTS day_type text NOT NULL DEFAULT 'full';

ALTER TABLE public.worker_attendance
  DROP CONSTRAINT IF EXISTS worker_attendance_day_type_check;

ALTER TABLE public.worker_attendance
  ADD CONSTRAINT worker_attendance_day_type_check CHECK (day_type IN ('full','half','ot'));

-- ---------- 20260819000000_worker_accounts_read_only.sql ----------
DROP POLICY IF EXISTS workers_all_public ON public.workers;
DROP POLICY IF EXISTS worker_attendance_all_public ON public.worker_attendance;
DROP POLICY IF EXISTS worker_payments_all_public ON public.worker_payments;

CREATE POLICY workers_legacy_admin ON public.workers
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY worker_attendance_legacy_admin ON public.worker_attendance
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY worker_payments_legacy_admin ON public.worker_payments
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY workers_worker_read_own ON public.workers
  FOR SELECT TO authenticated
  USING (
    id::text = (auth.jwt() -> 'user_metadata' ->> 'worker_id')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );
CREATE POLICY workers_staff_manage ON public.workers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY worker_attendance_worker_read_own ON public.worker_attendance
  FOR SELECT TO authenticated
  USING (
    worker_id::text = (auth.jwt() -> 'user_metadata' ->> 'worker_id')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );
CREATE POLICY worker_attendance_staff_manage ON public.worker_attendance
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY worker_payments_worker_read_own ON public.worker_payments
  FOR SELECT TO authenticated
  USING (
    worker_id::text = (auth.jwt() -> 'user_metadata' ->> 'worker_id')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );
CREATE POLICY worker_payments_staff_manage ON public.worker_payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

NOTIFY pgrst, 'reload schema';

-- ---------- 20260820000000_worker_feedback.sql ----------
CREATE TABLE public.worker_feedback (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  work_date date not null,
  attendance_feedback text,
  payment_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, work_date)
);

GRANT SELECT, INSERT, UPDATE ON public.worker_feedback TO anon, authenticated;
GRANT ALL ON public.worker_feedback TO service_role;
ALTER TABLE public.worker_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY worker_feedback_legacy_admin ON public.worker_feedback
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY worker_feedback_worker_read_own ON public.worker_feedback
  FOR SELECT TO authenticated
  USING (
    worker_id::text = (auth.jwt() -> 'user_metadata' ->> 'worker_id')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY worker_feedback_worker_write_own ON public.worker_feedback
  FOR INSERT TO authenticated
  WITH CHECK (worker_id::text = (auth.jwt() -> 'user_metadata' ->> 'worker_id'));

CREATE POLICY worker_feedback_worker_update_own ON public.worker_feedback
  FOR UPDATE TO authenticated
  USING (worker_id::text = (auth.jwt() -> 'user_metadata' ->> 'worker_id'))
  WITH CHECK (worker_id::text = (auth.jwt() -> 'user_metadata' ->> 'worker_id'));

CREATE POLICY worker_feedback_staff_manage ON public.worker_feedback
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER worker_feedback_updated_at
  BEFORE UPDATE ON public.worker_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------- 20260827040000_worker_locations.sql ----------
-- Live location tracking for workers.
-- One row per worker holding their latest known GPS fix + whether they
-- currently have location sharing switched on. Historical pings are not
-- kept — this is a live "where are they right now" view, not a trail log.

CREATE TABLE public.worker_locations (
  worker_id uuid PRIMARY KEY REFERENCES public.workers(id) ON DELETE CASCADE,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  sharing_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_locations TO anon, authenticated;
GRANT ALL ON public.worker_locations TO service_role;
ALTER TABLE public.worker_locations ENABLE ROW LEVEL SECURITY;

-- Matches the "legacy" anon-key admin access used by the rest of this app.
CREATE POLICY worker_locations_legacy_admin ON public.worker_locations
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Real Supabase-auth sessions (workers/admins/managers logged in properly).
CREATE POLICY worker_locations_worker_read_own ON public.worker_locations
  FOR SELECT TO authenticated
  USING (
    worker_id::text = (auth.jwt() -> 'user_metadata' ->> 'worker_id')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY worker_locations_worker_write_own ON public.worker_locations
  FOR INSERT TO authenticated
  WITH CHECK (worker_id::text = (auth.jwt() -> 'user_metadata' ->> 'worker_id'));

CREATE POLICY worker_locations_worker_update_own ON public.worker_locations
  FOR UPDATE TO authenticated
  USING (worker_id::text = (auth.jwt() -> 'user_metadata' ->> 'worker_id'))
  WITH CHECK (worker_id::text = (auth.jwt() -> 'user_metadata' ->> 'worker_id'));

CREATE POLICY worker_locations_staff_manage ON public.worker_locations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER worker_locations_updated_at
  BEFORE UPDATE ON public.worker_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';

-- ---------- 20260827050000_add_payment_status_to_rentals.sql ----------
ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

ALTER TABLE public.rentals
  DROP CONSTRAINT IF EXISTS rentals_payment_status_check;

ALTER TABLE public.rentals
  ADD CONSTRAINT rentals_payment_status_check CHECK (payment_status IN ('paid', 'unpaid'));

-- ---------- 20260902000000_enable_realtime_tables.sql ----------


-- ---------- 20260902010000_single_worker_device_session.sql ----------
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS session_token text;

COMMENT ON COLUMN public.workers.session_token IS
  'Token for the one device currently signed in to this worker account.';

NOTIFY pgrst, 'reload schema';

-- ---------- 20260903000000_add_worker_email_and_password.sql ----------
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS password text;

-- Preserve existing logins while moving credentials out of the mobile field.
UPDATE public.workers
SET password = phone
WHERE password IS NULL AND phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workers_email_lower_unique
  ON public.workers (lower(email))
  WHERE email IS NOT NULL;

NOTIFY pgrst, 'reload schema';


-- ---------- 20260903010000_require_separate_worker_passwords.sql ----------
-- Do not retain mobile numbers as passwords. Accounts must set a separate
-- password through Manage Users before they can sign in again.
UPDATE public.workers
SET password = NULL
WHERE password IS NOT NULL AND password = phone;

NOTIFY pgrst, 'reload schema';

-- ---------- 20260906000000_first_login_password_reset.sql ----------
-- The admin no longer chooses a user's password. When a user is created (or
-- has their password reset), the app sets password = their mobile number and
-- flags the row so the very next successful login is forced through a
-- "set your password" step before the session is granted.
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS must_set_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workers.must_set_password IS
  'True while the row''s password is still the mobile-number default (set at '
  'creation or on a reset). Cleared once the user chooses their own password '
  'on first login.';

-- Anyone who already has a real (non-default) password keeps it and is not
-- forced through the flow.
UPDATE public.workers
SET must_set_password = false
WHERE password IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ---------- 20260908000000_rentals_group_id.sql ----------
-- rentals.group_id bundles the materials that were added together into one card.
-- The app already relies on it, but no earlier migration created it (it was added
-- directly on the original database). Idempotent: does nothing where it exists.
-- On a brand-new project every existing row simply becomes its own group.
ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS group_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS rentals_group_id_idx ON public.rentals (group_id);


-- ---------- 20260920000000_multi_business.sql ----------
-- =====================================================================
-- MULTI-BUSINESS, PART 1 (additive — safe to run while the current app is live)
--
-- Adds the tenant model (businesses), real per-user accounts tied to
-- Supabase Auth, business-scoped row-level security, and moves every
-- existing row into a first business ("M.B.S CENTRING WORKS").
--
-- The legacy anonymous policies are deliberately LEFT IN PLACE here so the
-- currently deployed app keeps working until you deploy the new build.
-- They are removed by supabase/manual/lockdown.sql (run that LAST).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Businesses
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  location text,
  owner_line text,
  phone text,
  whatsapp text,
  logo_url text,
  stamp_url text,
  signature_url text,
  website_url text,
  instagram_url text,
  youtube_url text,
  maps_url text,
  reels_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Existing data belongs to this first business (fixed id so it can be used as
-- the temporary column default below).
INSERT INTO public.businesses
  (id, name, short_name, location, owner_line, phone, whatsapp, logo_url, stamp_url, signature_url,
   website_url, instagram_url, youtube_url, maps_url, reels_url)
VALUES (
  '00000000-0000-4000-a000-000000000001',
  'M.B.S CENTRING WORKS', 'MBS', 'Nereducherla',
  'Pro: Sk.M.Sharif Ph.no: 8688285959', '8688285959', '918688285959',
  '/logo.png', '/brand/mbs/stamp.png', '/brand/mbs/signature-mbs.png',
  'https://mbsndcl.vercel.app',
  'https://www.instagram.com/mbs_centrings_nereducherla/',
  'https://www.youtube.com/@mbs_centring_works_ndcl/?themeRefresh=1',
  'https://maps.app.goo.gl/PWjFYqqZrZRqSC2E6',
  'https://mbsndcl.vercel.app/reelmanagent'
)
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER businesses_updated_at BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2. Platform ("default") admins — real Supabase Auth users who can create
--    businesses and enter any of them. active_business_id is the business
--    they are currently working inside (enforced by the database, so a
--    platform admin only ever sees one business's rows at a time).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM anon, authenticated;
GRANT ALL ON public.platform_admins TO service_role;

-- ---------------------------------------------------------------------
-- 3. workers = the per-business user table (worker / manager / admin)
-- ---------------------------------------------------------------------
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'worker',
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signature_url text;

ALTER TABLE public.workers DROP CONSTRAINT IF EXISTS workers_role_check;
ALTER TABLE public.workers
  ADD CONSTRAINT workers_role_check CHECK (role IN ('worker', 'manager', 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS workers_auth_user_id_unique
  ON public.workers (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- Roles used to be hidden in `notes` behind invisible markers. Read them into
-- the real column (the markers themselves are stripped later, in lockdown.sql,
-- so the currently deployed app keeps recognising its admins until then).
UPDATE public.workers SET role = 'admin'
  WHERE role = 'worker' AND notes LIKE chr(8291) || 'role:superadmin' || chr(8291) || '%';
UPDATE public.workers SET role = 'manager'
  WHERE role = 'worker' AND notes LIKE chr(8291) || 'role:admin' || chr(8291) || '%';

-- Mobile numbers become the login id, so they must be unique across the app.
-- Only enforced automatically if today's data has no duplicates.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.workers WHERE phone IS NOT NULL AND phone <> ''
    GROUP BY phone HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Duplicate mobile numbers exist in workers — fix them, then create workers_phone_unique manually.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS workers_phone_unique
      ON public.workers (phone) WHERE phone IS NOT NULL AND phone <> '';
  END IF;
END $$;

-- Optional: keep MBS's existing per-person receipt signatures.
UPDATE public.workers SET signature_url = '/brand/mbs/signature-salman.png' WHERE signature_url IS NULL AND lower(name) LIKE '%salman%';
UPDATE public.workers SET signature_url = '/brand/mbs/signature-hafiza.png' WHERE signature_url IS NULL AND lower(name) LIKE '%hafiza%';
UPDATE public.workers SET signature_url = '/brand/mbs/signature-sameer.png' WHERE signature_url IS NULL AND lower(name) LIKE '%sameer%';

-- ---------------------------------------------------------------------
-- 4. business_id on every data table.
--    Every existing row belongs to the first business, so the column is added
--    NOT NULL with that business as its DEFAULT — existing rows pick it up
--    without being rewritten (no updated_at churn). The DEFAULT is TEMPORARY:
--    it lets the currently deployed app's inserts keep working until
--    lockdown.sql removes it.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workers', 'rentals', 'diary_notes',
    'worker_attendance', 'worker_payments', 'worker_feedback', 'worker_locations'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS business_id uuid NOT NULL DEFAULT %L REFERENCES public.businesses(id) ON DELETE RESTRICT',
      t, '00000000-0000-4000-a000-000000000001'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (business_id)', t || '_business_id_idx', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 5. Helper functions used by the policies (SECURITY DEFINER so they can
--    read workers/platform_admins regardless of the caller's own RLS)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;

-- The business the caller is currently working inside. Platform admins: the
-- one they switched to. Everyone else: the business their account belongs to.
-- NULL when the account or the business is inactive.
CREATE OR REPLACE FUNCTION public.my_business_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT pa.active_business_id
       FROM public.platform_admins pa
       JOIN public.businesses b ON b.id = pa.active_business_id AND b.active
      WHERE pa.user_id = auth.uid()),
    (SELECT w.business_id
       FROM public.workers w
       JOIN public.businesses b ON b.id = w.business_id AND b.active
      WHERE w.auth_user_id = auth.uid() AND w.active
      LIMIT 1)
  );
$$;

-- 'admin' | 'manager' | 'worker' | NULL. A platform admin counts as 'admin'
-- inside whichever business they are working in.
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_super_admin() THEN 'admin'
    ELSE (SELECT w.role
            FROM public.workers w
            JOIN public.businesses b ON b.id = w.business_id AND b.active
           WHERE w.auth_user_id = auth.uid() AND w.active
           LIMIT 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.my_business_id() IS NOT NULL AND COALESCE(public.my_role() IN ('admin', 'manager'), false);
$$;

CREATE OR REPLACE FUNCTION public.is_business_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.my_business_id() IS NOT NULL AND COALESCE(public.my_role() = 'admin', false);
$$;

-- ---------------------------------------------------------------------
-- 6. RPCs the app calls
-- ---------------------------------------------------------------------
-- One device per account: store the token of the device that signed in last.
CREATE OR REPLACE FUNCTION public.claim_device(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.workers SET session_token = p_token WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.clear_must_set_password()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.workers SET must_set_password = false WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.set_active_business(p_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only the platform admin can switch business';
  END IF;
  IF p_business_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id) THEN
    RAISE EXCEPTION 'Business not found';
  END IF;
  UPDATE public.platform_admins SET active_business_id = p_business_id WHERE user_id = auth.uid();
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'is_super_admin()', 'my_business_id()', 'my_role()', 'is_staff()', 'is_business_admin()',
    'claim_device(text)', 'clear_must_set_password()', 'set_active_business(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 7. Triggers: rows can never be written into (or moved to) another business
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_business_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b uuid;
BEGIN
  b := public.my_business_id();
  IF b IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.business_id := b;
    ELSE
      NEW.business_id := OLD.business_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_business_from_worker()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT w.business_id INTO NEW.business_id FROM public.workers w WHERE w.id = NEW.worker_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rentals_business_id BEFORE INSERT OR UPDATE ON public.rentals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_business_id();
CREATE TRIGGER diary_notes_business_id BEFORE INSERT OR UPDATE ON public.diary_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_business_id();
CREATE TRIGGER worker_attendance_business_id BEFORE INSERT OR UPDATE OF worker_id ON public.worker_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_business_from_worker();
CREATE TRIGGER worker_payments_business_id BEFORE INSERT OR UPDATE OF worker_id ON public.worker_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_business_from_worker();
CREATE TRIGGER worker_feedback_business_id BEFORE INSERT OR UPDATE OF worker_id ON public.worker_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_business_from_worker();
CREATE TRIGGER worker_locations_business_id BEFORE INSERT OR UPDATE OF worker_id ON public.worker_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_business_from_worker();

-- A business admin may edit their own business profile, but only the platform
-- admin may activate/deactivate it.
CREATE OR REPLACE FUNCTION public.guard_business_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    NEW.active := OLD.active;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER businesses_guard BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_update();

-- ---------------------------------------------------------------------
-- 8. Row-level security for real (Supabase Auth) sessions
-- ---------------------------------------------------------------------
-- Drop the previous "authenticated" policies (they trusted the old has_role
-- table / a user_metadata claim). The legacy *anon* policies stay until
-- lockdown.sql.
DROP POLICY IF EXISTS workers_worker_read_own ON public.workers;
DROP POLICY IF EXISTS workers_staff_manage ON public.workers;
DROP POLICY IF EXISTS worker_attendance_worker_read_own ON public.worker_attendance;
DROP POLICY IF EXISTS worker_attendance_staff_manage ON public.worker_attendance;
DROP POLICY IF EXISTS worker_payments_worker_read_own ON public.worker_payments;
DROP POLICY IF EXISTS worker_payments_staff_manage ON public.worker_payments;
DROP POLICY IF EXISTS worker_feedback_worker_read_own ON public.worker_feedback;
DROP POLICY IF EXISTS worker_feedback_worker_write_own ON public.worker_feedback;
DROP POLICY IF EXISTS worker_feedback_worker_update_own ON public.worker_feedback;
DROP POLICY IF EXISTS worker_feedback_staff_manage ON public.worker_feedback;
DROP POLICY IF EXISTS worker_locations_worker_read_own ON public.worker_locations;
DROP POLICY IF EXISTS worker_locations_worker_write_own ON public.worker_locations;
DROP POLICY IF EXISTS worker_locations_worker_update_own ON public.worker_locations;
DROP POLICY IF EXISTS worker_locations_staff_manage ON public.worker_locations;
DROP POLICY IF EXISTS rentals_all_authenticated ON public.rentals;
DROP POLICY IF EXISTS user_roles_select_own_or_admin ON public.user_roles;
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;

-- rentals / diary_notes had a policy for BOTH anon and authenticated. Narrow it
-- to anon (the legacy app) so signed-in users are governed only by the
-- business-scoped policies below.
ALTER POLICY rentals_all_public ON public.rentals TO anon;
ALTER POLICY diary_notes_all_public ON public.diary_notes TO anon;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;

CREATE POLICY businesses_select ON public.businesses FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()) OR id = (SELECT public.my_business_id()));
CREATE POLICY businesses_update ON public.businesses FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()) OR (id = (SELECT public.my_business_id()) AND (SELECT public.is_business_admin())))
  WITH CHECK ((SELECT public.is_super_admin()) OR (id = (SELECT public.my_business_id()) AND (SELECT public.is_business_admin())));

-- workers: staff see everyone in their business, everyone else sees only their
-- own row. There are deliberately NO client write policies — users are created,
-- edited and removed through the server functions (service role) so the Auth
-- account and the row can never drift apart.
REVOKE INSERT, UPDATE, DELETE ON public.workers FROM authenticated;
CREATE POLICY workers_select ON public.workers FOR SELECT TO authenticated
  USING (
    business_id = (SELECT public.my_business_id())
    AND ((SELECT public.is_staff()) OR auth_user_id = (SELECT auth.uid()))
  );

-- rentals + diary: business staff only
CREATE POLICY rentals_staff ON public.rentals FOR ALL TO authenticated
  USING (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()))
  WITH CHECK (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()));
CREATE POLICY diary_notes_staff ON public.diary_notes FOR ALL TO authenticated
  USING (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()))
  WITH CHECK (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()));

-- attendance + payments: staff manage, a worker reads their own
CREATE POLICY worker_attendance_staff ON public.worker_attendance FOR ALL TO authenticated
  USING (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()))
  WITH CHECK (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()));
CREATE POLICY worker_attendance_own ON public.worker_attendance FOR SELECT TO authenticated
  USING (worker_id IN (SELECT id FROM public.workers WHERE auth_user_id = (SELECT auth.uid())));

CREATE POLICY worker_payments_staff ON public.worker_payments FOR ALL TO authenticated
  USING (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()))
  WITH CHECK (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()));
CREATE POLICY worker_payments_own ON public.worker_payments FOR SELECT TO authenticated
  USING (worker_id IN (SELECT id FROM public.workers WHERE auth_user_id = (SELECT auth.uid())));

-- feedback + locations: staff manage, a worker reads/writes their own
CREATE POLICY worker_feedback_staff ON public.worker_feedback FOR ALL TO authenticated
  USING (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()))
  WITH CHECK (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()));
CREATE POLICY worker_feedback_own ON public.worker_feedback FOR ALL TO authenticated
  USING (worker_id IN (SELECT id FROM public.workers WHERE auth_user_id = (SELECT auth.uid())))
  WITH CHECK (worker_id IN (SELECT id FROM public.workers WHERE auth_user_id = (SELECT auth.uid())));

CREATE POLICY worker_locations_staff ON public.worker_locations FOR ALL TO authenticated
  USING (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()))
  WITH CHECK (business_id = (SELECT public.my_business_id()) AND (SELECT public.is_staff()));
CREATE POLICY worker_locations_own ON public.worker_locations FOR ALL TO authenticated
  USING (worker_id IN (SELECT id FROM public.workers WHERE auth_user_id = (SELECT auth.uid())))
  WITH CHECK (worker_id IN (SELECT id FROM public.workers WHERE auth_user_id = (SELECT auth.uid())));

-- Legacy tables: the auth-signup trigger used to hand every new Auth user a
-- profile and a role. Accounts are now provisioned by the server functions.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------
-- 9. Storage for each business's logo / stamp / signature
--    (public-read so receipts render; only that business's admin can write,
--     and only inside a folder named after its id)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-assets', 'business-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY business_assets_read ON storage.objects FOR SELECT
  USING (bucket_id = 'business-assets');
CREATE POLICY business_assets_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'business-assets'
    AND (storage.foldername(name))[1] = (SELECT public.my_business_id())::text
    AND (SELECT public.is_business_admin())
  );
CREATE POLICY business_assets_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'business-assets'
    AND (storage.foldername(name))[1] = (SELECT public.my_business_id())::text
    AND (SELECT public.is_business_admin())
  );
CREATE POLICY business_assets_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'business-assets'
    AND (storage.foldername(name))[1] = (SELECT public.my_business_id())::text
    AND (SELECT public.is_business_admin())
  );

NOTIFY pgrst, 'reload schema';


-- ---------- 20260921000000_login_username.sql ----------
-- Optional username for signing in (alongside mobile number and email).
-- Case-insensitive and unique across the whole app.
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS workers_username_unique
  ON public.workers (lower(username))
  WHERE username IS NOT NULL AND username <> '';

NOTIFY pgrst, 'reload schema';


-- ---------- 20260922000000_platform_admin_console.sql ----------
-- =====================================================================
-- Platform admin console
--
-- The platform admin ("default admin") now only manages businesses and their
-- users. They no longer open a business or see its rentals, diary, labour or
-- reports. They sign in like everyone else: mobile number, email or username.
-- =====================================================================

-- 1. Profile fields, so the platform admin can sign in with any of the three
ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS username text;

UPDATE public.platform_admins pa
   SET email = u.email,
       name = COALESCE(pa.name, u.raw_user_meta_data ->> 'name', 'Platform admin')
  FROM auth.users u
 WHERE u.id = pa.user_id AND pa.email IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_admins_phone_unique
  ON public.platform_admins (phone) WHERE phone IS NOT NULL AND phone <> '';
CREATE UNIQUE INDEX IF NOT EXISTS platform_admins_username_unique
  ON public.platform_admins (lower(username)) WHERE username IS NOT NULL AND username <> '';

-- 2. A platform admin no longer "works inside" a business. From now on a caller's
--    business comes only from their own worker/manager/admin account, so the
--    platform admin has no access to any business's data (rentals, diary, ...).
CREATE OR REPLACE FUNCTION public.my_business_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.business_id
    FROM public.workers w
    JOIN public.businesses b ON b.id = w.business_id AND b.active
   WHERE w.auth_user_id = auth.uid() AND w.active
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.role
    FROM public.workers w
    JOIN public.businesses b ON b.id = w.business_id AND b.active
   WHERE w.auth_user_id = auth.uid() AND w.active
   LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.set_active_business(uuid);
ALTER TABLE public.platform_admins DROP COLUMN IF EXISTS active_business_id;

-- 3. The platform admin may LIST users of every business (to manage them);
--    creating/editing/deleting still goes through the server functions.
DROP POLICY IF EXISTS workers_select_platform ON public.workers;
CREATE POLICY workers_select_platform ON public.workers FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()));

NOTIFY pgrst, 'reload schema';