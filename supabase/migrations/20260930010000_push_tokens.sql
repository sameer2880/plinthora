-- Push notification devices
-- One row per phone that is signed in and has allowed notifications. The
-- send-push Edge Function reads this table (service role) to know where to send
-- an alert when something is added, modified or deleted.
-- Run once in Supabase -> SQL Editor (after 20260930000000_activity_notifications.sql).

CREATE TABLE IF NOT EXISTS public.push_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  platform    text NOT NULL DEFAULT 'android',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_business_idx ON public.push_tokens (business_id);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
-- Nobody touches the table directly from the browser; the two functions below do it.
REVOKE ALL ON public.push_tokens FROM anon, authenticated;
GRANT ALL ON public.push_tokens TO service_role;

-- Called by the app after sign-in (and every time it opens). Re-assigns the phone
-- to whoever is signed in on it now, so a shared phone never alerts the old user.
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text DEFAULT 'android')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b uuid := public.my_business_id();
BEGIN
  IF auth.uid() IS NULL OR b IS NULL OR NOT public.is_staff() OR COALESCE(p_token, '') = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.push_tokens (token, user_id, business_id, platform)
  VALUES (p_token, auth.uid(), b, COALESCE(NULLIF(p_platform, ''), 'android'))
  ON CONFLICT (token) DO UPDATE
    SET user_id     = EXCLUDED.user_id,
        business_id = EXCLUDED.business_id,
        platform    = EXCLUDED.platform,
        updated_at  = now();
END;
$$;

-- Called by the app when the person signs out.
CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.push_tokens WHERE token = p_token AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unregister_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_token(text) TO authenticated;