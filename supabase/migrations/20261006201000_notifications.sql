-- Milestone 3 / notifications: an outbox and an inbox. Something happens (a friend request, a
-- challenge); a trigger writes one outbox row in the SAME transaction, so a change and its
-- notification stand or fall together. The server later hands each outbox row to every notification
-- provider (the in-app provider writes the student's inbox row; an email or push provider would send
-- from the same row), then marks it delivered.
--
-- The inbox row uses the outbox row's id, so delivering the same notification twice (a crash between
-- delivering and marking it delivered) leaves one inbox row. Both tables are closed to signed-in
-- students: they read and clear their notifications through server functions only.

CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'friend_request_received', 'friend_request_accepted', 'challenge_received', 'challenge_declined')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  dispatched_at timestamptz,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 500)
);
CREATE INDEX idx_notification_outbox_pending
  ON public.notification_outbox (user_id, created_at) WHERE dispatched_at IS NULL;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX idx_notifications_user ON public.notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications (user_id) WHERE read_at IS NULL;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_outbox, public.notifications FROM anon, authenticated;
GRANT ALL ON public.notification_outbox, public.notifications TO service_role;

-- ============ Events ============
CREATE OR REPLACE FUNCTION app_private.enqueue_notification(_user_id uuid, _kind text, _payload jsonb)
RETURNS void
LANGUAGE sql SET search_path = public AS $$
  INSERT INTO public.notification_outbox (user_id, kind, payload) VALUES (_user_id, _kind, _payload)
$$;

CREATE OR REPLACE FUNCTION app_private.username_of(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT p.username FROM public.profiles p WHERE p.id = _user_id), 'A student')
$$;

-- A request was made: tell the student who was asked.
CREATE OR REPLACE FUNCTION app_private.notify_friend_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private AS $$
BEGIN
  PERFORM app_private.enqueue_notification(NEW.addressee_id, 'friend_request_received',
    jsonb_build_object('friendshipId', NEW.id, 'fromUsername', app_private.username_of(NEW.requester_id)));
  RETURN NEW;
END $$;

-- A request was accepted: tell the student who asked. (A declined request is deleted and says nothing.)
CREATE OR REPLACE FUNCTION app_private.notify_friend_accepted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private AS $$
BEGIN
  PERFORM app_private.enqueue_notification(NEW.requester_id, 'friend_request_accepted',
    jsonb_build_object('friendshipId', NEW.id, 'username', app_private.username_of(NEW.addressee_id)));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app_private.notify_challenge_received()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private AS $$
BEGIN
  PERFORM app_private.enqueue_notification(NEW.opponent_id, 'challenge_received',
    jsonb_build_object('challengeId', NEW.id, 'fromUsername', app_private.username_of(NEW.challenger_id),
                       'totalQuestions', cardinality(NEW.question_ids)));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app_private.notify_challenge_declined()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private AS $$
BEGIN
  PERFORM app_private.enqueue_notification(NEW.challenger_id, 'challenge_declined',
    jsonb_build_object('challengeId', NEW.id, 'username', app_private.username_of(NEW.opponent_id)));
  RETURN NEW;
END $$;

CREATE TRIGGER friendships_notify_request AFTER INSERT ON public.friendships
  FOR EACH ROW WHEN (NEW.status = 'pending') EXECUTE FUNCTION app_private.notify_friend_request();
CREATE TRIGGER friendships_notify_accepted AFTER UPDATE OF status ON public.friendships
  FOR EACH ROW WHEN (OLD.status = 'pending' AND NEW.status = 'accepted')
  EXECUTE FUNCTION app_private.notify_friend_accepted();
CREATE TRIGGER friend_challenges_notify_received AFTER INSERT ON public.friend_challenges
  FOR EACH ROW EXECUTE FUNCTION app_private.notify_challenge_received();
CREATE TRIGGER friend_challenges_notify_declined AFTER UPDATE OF declined_at ON public.friend_challenges
  FOR EACH ROW WHEN (OLD.declined_at IS NULL AND NEW.declined_at IS NOT NULL)
  EXECUTE FUNCTION app_private.notify_challenge_declined();

-- ============ Delivering ============
-- Hands a student's waiting notifications to the server, oldest first, and counts the attempt. A row
-- already handed over is not handed over again until `_stale_after_seconds` pass (a delivery that went
-- quiet), and never after `_max_attempts`. Concurrent callers take different rows (SKIP LOCKED).
CREATE OR REPLACE FUNCTION public.claim_notifications(
  _user_id uuid, _limit integer, _max_attempts integer, _stale_after_seconds integer)
RETURNS TABLE (id uuid, kind text, payload jsonb, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH picked AS (
    SELECT o.id FROM public.notification_outbox o
     WHERE o.user_id = _user_id AND o.dispatched_at IS NULL AND o.attempts < _max_attempts
       AND (o.claimed_at IS NULL OR o.claimed_at < now() - make_interval(secs => _stale_after_seconds))
     ORDER BY o.created_at, o.id
     LIMIT least(greatest(_limit, 1), 100)
     FOR UPDATE SKIP LOCKED)
  UPDATE public.notification_outbox o
     SET attempts = o.attempts + 1, claimed_at = now()
    FROM picked
   WHERE o.id = picked.id
  RETURNING o.id, o.kind, o.payload, o.created_at
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_dispatched(_ids uuid[])
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notification_outbox o SET dispatched_at = now()
   WHERE o.id = ANY (_ids) AND o.dispatched_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.record_notification_failure(_id uuid, _error text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notification_outbox o SET last_error = left(_error, 500) WHERE o.id = _id
$$;

-- ============ The inbox ============
CREATE OR REPLACE FUNCTION public.list_notifications(
  _user_id uuid, _unread_only boolean, _limit integer, _offset integer)
RETURNS TABLE (id uuid, kind text, payload jsonb, created_at timestamptz, read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.kind, n.payload, n.created_at, n.read_at
    FROM public.notifications n
   WHERE n.user_id = _user_id AND (NOT _unread_only OR n.read_at IS NULL)
   ORDER BY n.created_at DESC, n.id
   LIMIT least(greatest(_limit, 1), 200) OFFSET greatest(_offset, 0)
$$;

CREATE OR REPLACE FUNCTION public.count_unread_notifications(_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM public.notifications n WHERE n.user_id = _user_id AND n.read_at IS NULL
$$;

-- Marks the student's own unread notifications read: the ones named, or all of them when no ids are
-- given. Ids that belong to someone else, or are already read, are ignored. Returns how many changed.
CREATE OR REPLACE FUNCTION public.mark_notifications_read(_user_id uuid, _ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH changed AS (
    UPDATE public.notifications n SET read_at = now()
     WHERE n.user_id = _user_id AND n.read_at IS NULL AND (_ids IS NULL OR n.id = ANY (_ids))
    RETURNING 1)
  SELECT count(*)::integer FROM changed
$$;

REVOKE ALL ON FUNCTION app_private.enqueue_notification(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.username_of(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.notify_friend_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.notify_friend_accepted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.notify_challenge_received() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.notify_challenge_declined() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_notifications(uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_notifications_dispatched(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_notification_failure(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_notifications(uuid, boolean, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_unread_notifications(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notifications(uuid, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_notifications_dispatched(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_notification_failure(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_notifications(uuid, boolean, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_unread_notifications(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid, uuid[]) TO service_role;
