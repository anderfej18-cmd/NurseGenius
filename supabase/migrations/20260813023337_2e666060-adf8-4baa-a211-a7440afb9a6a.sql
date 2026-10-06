-- Plans table
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  price_ngn numeric NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plans TO authenticated;
GRANT SELECT ON public.plans TO anon;
GRANT ALL ON public.plans TO service_role;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone reads active plans" ON public.plans;
CREATE POLICY "anyone reads active plans" ON public.plans
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "central admin manages plans" ON public.plans;
CREATE POLICY "central admin manages plans" ON public.plans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'central_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'central_admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS update_plans_updated_at ON public.plans;
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.plans (name, price_ngn, duration_days, is_active)
VALUES ('erudite', 1500, 30, true), ('scholar', 2000, 30, true)
ON CONFLICT (name) DO NOTHING;

-- Subscription payments log
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name text NOT NULL,
  amount_ngn numeric NOT NULL,
  duration_days integer NOT NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_payments TO authenticated;
GRANT ALL ON public.subscription_payments TO service_role;

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users view own payments or admins view all" ON public.subscription_payments;
CREATE POLICY "users view own payments or admins view all" ON public.subscription_payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_any_admin(auth.uid()));

-- Activate a subscription after a successful Paystack payment
CREATE OR REPLACE FUNCTION public.activate_subscription(_tier user_tier, _reference text, _amount numeric)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _days int;
  _expiry timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _tier NOT IN ('erudite','scholar') THEN RAISE EXCEPTION 'invalid tier'; END IF;

  SELECT duration_days INTO _days FROM public.plans WHERE name = _tier::text AND is_active;
  _days := COALESCE(_days, 30);
  _expiry := now() + (_days || ' days')::interval;

  UPDATE public.profiles SET tier = _tier, expiry_date = _expiry WHERE id = _uid;

  INSERT INTO public.subscription_payments (user_id, plan_name, amount_ngn, duration_days, reference)
  VALUES (_uid, _tier::text, _amount, _days, _reference);

  RETURN _expiry;
END $$;

REVOKE ALL ON FUNCTION public.activate_subscription(user_tier, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_subscription(user_tier, text, numeric) TO authenticated;