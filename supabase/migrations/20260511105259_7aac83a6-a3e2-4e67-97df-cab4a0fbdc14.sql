
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('central_admin', 'admin', 'user');
CREATE TYPE public.user_tier AS ENUM ('novice', 'erudite', 'scholar');
CREATE TYPE public.exam_type AS ENUM ('RN', 'RM');
CREATE TYPE public.receipt_status AS ENUM ('pending', 'approved', 'rejected');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  username TEXT UNIQUE,
  exam_date DATE,
  exam_preference TEXT CHECK (exam_preference IN ('RN','RM','Both')),
  tier public.user_tier NOT NULL DEFAULT 'novice',
  expiry_date TIMESTAMPTZ,
  questions_today INT NOT NULL DEFAULT 0,
  last_question_date DATE,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','central_admin'))
$$;

-- ============ QUESTIONS ============
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type public.exam_type NOT NULL,
  topic TEXT NOT NULL DEFAULT 'General',
  year INT,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  rationale TEXT,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_questions_type_topic ON public.questions(exam_type, topic);

-- ============ EXAMS ============
CREATE TABLE public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  exam_type public.exam_type NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  total_questions INT NOT NULL,
  time_limit_minutes INT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  score_pct NUMERIC(5,2),
  correct_count INT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned'))
);
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_exams_user ON public.exams(user_id);

-- ============ EXAM ANSWERS ============
CREATE TABLE public.exam_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id),
  user_answer CHAR(1),
  is_correct BOOLEAN,
  flagged BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL,
  UNIQUE(exam_id, position)
);
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;

-- ============ PAYMENT RECEIPTS ============
CREATE TABLE public.payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  amount NUMERIC(10,2),
  target_tier public.user_tier NOT NULL,
  status public.receipt_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

-- ============ SETTINGS ============
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  erudite_price NUMERIC(10,2) NOT NULL DEFAULT 1500,
  scholar_price NUMERIC(10,2) NOT NULL DEFAULT 2000,
  erudite_days INT NOT NULL DEFAULT 30,
  scholar_days INT NOT NULL DEFAULT 30,
  novice_daily_limit INT NOT NULL DEFAULT 50,
  erudite_daily_limit INT NOT NULL DEFAULT 150,
  scholar_daily_limit INT NOT NULL DEFAULT 250,
  bank_name TEXT NOT NULL DEFAULT 'Opay',
  bank_account TEXT NOT NULL DEFAULT '9079441302',
  bank_account_name TEXT NOT NULL DEFAULT 'Fejokwu Alexander Mayowa'
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.app_settings (id) VALUES (1);

-- ============ ADMIN CODES ============
CREATE TABLE public.admin_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  used_by UUID REFERENCES auth.users,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_codes ENABLE ROW LEVEL SECURITY;

-- ============ AUTO-PROFILE TRIGGER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  -- Auto-grant central_admin if matching email
  IF NEW.email = 'nursegenius3@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'central_admin')
    ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ AUTO-EXPIRE FUNCTION ============
CREATE OR REPLACE FUNCTION public.check_expire_tier(_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET tier = 'novice', expiry_date = NULL
  WHERE id = _user_id AND expiry_date IS NOT NULL AND expiry_date < now() AND tier <> 'novice';
END $$;

-- ============ APPROVE RECEIPT (atomic) ============
CREATE OR REPLACE FUNCTION public.approve_receipt(_receipt_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  s RECORD;
  days INT;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO r FROM public.payment_receipts WHERE id = _receipt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  SELECT * INTO s FROM public.app_settings WHERE id = 1;
  days := CASE WHEN r.target_tier = 'erudite' THEN s.erudite_days ELSE s.scholar_days END;
  UPDATE public.profiles
    SET tier = r.target_tier, expiry_date = now() + (days || ' days')::interval
    WHERE id = r.user_id;
  UPDATE public.payment_receipts
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _receipt_id;
END $$;

-- ============ KILL SWITCH ============
CREATE OR REPLACE FUNCTION public.reset_user_to_novice(_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'central_admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.profiles SET tier = 'novice', expiry_date = NULL WHERE id = _user_id;
END $$;

-- ============ REDEEM ADMIN CODE ============
CREATE OR REPLACE FUNCTION public.redeem_admin_code(_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD;
BEGIN
  SELECT * INTO c FROM public.admin_codes WHERE code = _code AND used_by IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.admin_codes SET used_by = auth.uid(), used_at = now() WHERE id = c.id;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin') ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

-- ============ RLS POLICIES ============

-- profiles
CREATE POLICY "users view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_any_admin(auth.uid()));
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "central admin updates any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'central_admin'));

-- user_roles
CREATE POLICY "users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'central_admin'));
CREATE POLICY "central admin manages roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'central_admin')) WITH CHECK (public.has_role(auth.uid(),'central_admin'));

-- questions
CREATE POLICY "any authenticated reads questions" ON public.questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins insert questions" ON public.questions FOR INSERT TO authenticated WITH CHECK (public.is_any_admin(auth.uid()));
CREATE POLICY "admins update questions" ON public.questions FOR UPDATE TO authenticated USING (public.is_any_admin(auth.uid()));
CREATE POLICY "admins delete questions" ON public.questions FOR DELETE TO authenticated USING (public.is_any_admin(auth.uid()));

-- exams
CREATE POLICY "users manage own exams" ON public.exams FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins read exams" ON public.exams FOR SELECT TO authenticated USING (public.is_any_admin(auth.uid()));

-- exam_answers
CREATE POLICY "users manage own answers" ON public.exam_answers FOR ALL TO authenticated
USING (EXISTS(SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.user_id = auth.uid()))
WITH CHECK (EXISTS(SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.user_id = auth.uid()));

-- payment_receipts
CREATE POLICY "users insert own receipts" ON public.payment_receipts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users view own receipts" ON public.payment_receipts FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_any_admin(auth.uid()));
CREATE POLICY "admins update receipts" ON public.payment_receipts FOR UPDATE TO authenticated USING (public.is_any_admin(auth.uid()));

-- app_settings
CREATE POLICY "any authenticated reads settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "central admin updates settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'central_admin'));

-- admin_codes
CREATE POLICY "central admin manages codes" ON public.admin_codes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'central_admin')) WITH CHECK (public.has_role(auth.uid(),'central_admin'));

-- ============ STORAGE: receipts bucket (private) ============
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts','receipts', false) ON CONFLICT DO NOTHING;

CREATE POLICY "users upload own receipts" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users read own receipts" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'receipts' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_any_admin(auth.uid())));
