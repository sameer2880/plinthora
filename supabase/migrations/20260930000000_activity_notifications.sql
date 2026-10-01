-- Activity notifications
-- Records who added / modified / deleted what, so the bell icon in the app can
-- show it live (with a "ting" sound). Run this once in Supabase -> SQL Editor.

-- ---------------------------------------------------------------------
-- 1. The log table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_name    text NOT NULL DEFAULT 'Someone',
  action        text NOT NULL CHECK (action IN ('added', 'modified', 'deleted')),
  entity        text NOT NULL,   -- rental | diary | attendance | payment | feedback
  entity_key    text,            -- used to merge duplicate rows of one action
  summary       text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_business_created_idx
  ON public.activity_log (business_id, created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Only the owner/admin and managers of a business read its log. Nobody writes
-- to it from the browser: rows are created by the trigger below.
REVOKE ALL ON public.activity_log FROM anon, authenticated;
GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

DROP POLICY IF EXISTS activity_log_staff_read ON public.activity_log;
CREATE POLICY activity_log_staff_read ON public.activity_log
  FOR SELECT TO authenticated
  USING (business_id = public.my_business_id() AND public.is_staff());

-- ---------------------------------------------------------------------
-- 2. The trigger function (shared by all tracked tables)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r         jsonb;
  old_r     jsonb;
  biz       uuid;
  act       text;
  ent       text;
  ekey      text;
  summ      text;
  actor_id  uuid := auth.uid();
  actor     text;
  wname     text;
BEGIN
  -- Changes made by the server (service role) or by cascades have no signed-in
  -- user. Skip them so deleting a worker doesn't flood the log.
  IF actor_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    r := to_jsonb(OLD);
    act := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    r := to_jsonb(NEW);
    act := 'added';
  ELSE
    r := to_jsonb(NEW);
    old_r := to_jsonb(OLD);
    act := 'modified';
    -- ignore updates where nothing but updated_at changed
    IF (r - 'updated_at') = (old_r - 'updated_at') THEN
      RETURN NEW;
    END IF;
  END IF;

  biz := NULLIF(r ->> 'business_id', '')::uuid;
  IF biz IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT w.name INTO actor FROM public.workers w WHERE w.auth_user_id = actor_id LIMIT 1;
  IF actor IS NULL THEN
    actor := CASE WHEN public.is_super_admin() THEN 'Platform admin' ELSE 'Someone' END;
  END IF;

  IF TG_TABLE_NAME = 'rentals' THEN
    ent := 'rental';
    ekey := COALESCE(r ->> 'group_id', r ->> 'id');
    summ := COALESCE(r ->> 'customer_name', 'a customer');
    IF act = 'modified' THEN
      IF r ->> 'status' IS DISTINCT FROM old_r ->> 'status' THEN
        summ := summ || ' - status: ' || COALESCE(r ->> 'status', '');
      ELSIF r ->> 'payment_status' IS DISTINCT FROM old_r ->> 'payment_status' THEN
        summ := summ || ' - payment: ' || COALESCE(r ->> 'payment_status', '');
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'diary_notes' THEN
    ent := 'diary';
    ekey := r ->> 'id';
    summ := COALESCE(NULLIF(r ->> 'title', ''), 'a diary note');

  ELSE
    -- worker_attendance / worker_payments / worker_feedback
    SELECT w.name INTO wname FROM public.workers w WHERE w.id = NULLIF(r ->> 'worker_id', '')::uuid;
    wname := COALESCE(wname, 'a worker');
    ekey := r ->> 'id';
    IF TG_TABLE_NAME = 'worker_attendance' THEN
      ent := 'attendance';
      summ := wname || ' - ' || COALESCE(r ->> 'work_date', '') ||
              CASE WHEN (r ->> 'present')::boolean IS FALSE THEN ' (absent)' ELSE ' (present)' END;
    ELSIF TG_TABLE_NAME = 'worker_payments' THEN
      ent := 'payment';
      summ := wname || ' - Rs ' || COALESCE(r ->> 'amount', '0');
    ELSE
      ent := 'feedback';
      summ := wname || ' - ' || COALESCE(r ->> 'work_date', '');
    END IF;
  END IF;

  -- One user action can touch several rows (a rental with many materials).
  -- Log it once.
  IF EXISTS (
    SELECT 1 FROM public.activity_log a
     WHERE a.business_id = biz
       AND a.actor_user_id = actor_id
       AND a.action = act
       AND a.entity = ent
       AND a.entity_key IS NOT DISTINCT FROM ekey
       AND a.created_at > now() - interval '10 seconds'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.activity_log (business_id, actor_user_id, actor_name, action, entity, entity_key, summary)
  VALUES (biz, actor_id, actor, act, ent, ekey, summ);

  -- keep the table small: occasionally drop entries older than 60 days
  IF random() < 0.02 THEN
    DELETE FROM public.activity_log WHERE created_at < now() - interval '60 days';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Attach it to the tables people edit
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS rentals_activity ON public.rentals;
CREATE TRIGGER rentals_activity AFTER INSERT OR UPDATE OR DELETE ON public.rentals
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS diary_notes_activity ON public.diary_notes;
CREATE TRIGGER diary_notes_activity AFTER INSERT OR UPDATE OR DELETE ON public.diary_notes
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS worker_attendance_activity ON public.worker_attendance;
CREATE TRIGGER worker_attendance_activity AFTER INSERT OR UPDATE OR DELETE ON public.worker_attendance
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS worker_payments_activity ON public.worker_payments;
CREATE TRIGGER worker_payments_activity AFTER INSERT OR UPDATE OR DELETE ON public.worker_payments
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS worker_feedback_activity ON public.worker_feedback;
CREATE TRIGGER worker_feedback_activity AFTER INSERT OR UPDATE OR DELETE ON public.worker_feedback
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- ---------------------------------------------------------------------
-- 4. Live delivery to the browser
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
  END IF;
END $$;