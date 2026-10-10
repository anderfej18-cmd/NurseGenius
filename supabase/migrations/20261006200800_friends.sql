-- Milestone 3 / competition, part 1: friends. A friendship is one row per pair of students, asked by one
-- and answered by the other. Nothing here can be read or written by a signed-in student directly: the
-- server calls these functions with the student's id from the verified token, so a student sees
-- another student only as a username, and only through the lists below.
--
-- A declined request is deleted, so there is no record of it and it can be asked again; the caps on
-- friends and waiting requests (passed in by the application) are what stop a student being flooded.

CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (requester_id <> addressee_id)
);
-- One row per pair, whichever student asked.
CREATE UNIQUE INDEX friendships_pair_unique
  ON public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
CREATE INDEX idx_friendships_requester ON public.friendships (requester_id, status);
CREATE INDEX idx_friendships_addressee ON public.friendships (addressee_id, status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friendships FROM anon, authenticated;
GRANT ALL ON public.friendships TO service_role;

CREATE OR REPLACE FUNCTION app_private.friend_count(_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT count(*)::integer FROM public.friendships f
   WHERE f.status = 'accepted' AND _user_id IN (f.requester_id, f.addressee_id)
$$;

-- ============ Asking ============
-- Asks the student with this username. If that student has already asked this one, the two requests
-- meet and the friendship is made. The asker's own profile row is locked so their caps hold under
-- concurrent calls.
CREATE OR REPLACE FUNCTION public.request_friend(
  _user_id uuid, _username text, _max_friends integer, _max_pending integer)
RETURNS TABLE (friendship_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private AS $$
DECLARE
  v_other uuid;
  f public.friendships%ROWTYPE;
BEGIN
  SELECT p.id INTO v_other FROM public.profiles p WHERE p.username = _username;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_other = _user_id THEN RAISE EXCEPTION 'cannot_befriend_self'; END IF;

  PERFORM 1 FROM public.profiles p WHERE p.id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  SELECT * INTO f FROM public.friendships x
   WHERE least(x.requester_id, x.addressee_id) = least(_user_id, v_other)
     AND greatest(x.requester_id, x.addressee_id) = greatest(_user_id, v_other);
  IF FOUND THEN
    IF f.status = 'accepted' THEN RAISE EXCEPTION 'already_friends'; END IF;
    IF f.requester_id = _user_id THEN RAISE EXCEPTION 'request_pending'; END IF;
    -- They asked first: asking back accepts.
    IF app_private.friend_count(_user_id) >= _max_friends
       OR app_private.friend_count(v_other) >= _max_friends THEN
      RAISE EXCEPTION 'friend_limit';
    END IF;
    UPDATE public.friendships SET status = 'accepted', responded_at = now() WHERE id = f.id;
    RETURN QUERY SELECT f.id, 'accepted'::text;
    RETURN;
  END IF;

  IF app_private.friend_count(_user_id) >= _max_friends THEN RAISE EXCEPTION 'friend_limit'; END IF;
  IF (SELECT count(*) FROM public.friendships x
       WHERE x.requester_id = _user_id AND x.status = 'pending') >= _max_pending THEN
    RAISE EXCEPTION 'request_limit';
  END IF;

  INSERT INTO public.friendships (requester_id, addressee_id) VALUES (_user_id, v_other)
  RETURNING id INTO friendship_id;
  status := 'pending';
  RETURN NEXT;
END $$;

-- ============ Answering ============
-- Only the student who was asked can answer, and only while the request is waiting. Accepting needs
-- room for both students; declining deletes the request.
CREATE OR REPLACE FUNCTION public.respond_friend_request(
  _user_id uuid, _friendship_id uuid, _accept boolean, _max_friends integer)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private AS $$
DECLARE
  f public.friendships%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.friendships x
   WHERE x.id = _friendship_id AND x.addressee_id = _user_id AND x.status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'friendship_not_found'; END IF;

  IF NOT _accept THEN
    DELETE FROM public.friendships WHERE id = f.id;
    RETURN 'declined';
  END IF;
  IF app_private.friend_count(f.requester_id) >= _max_friends
     OR app_private.friend_count(f.addressee_id) >= _max_friends THEN
    RAISE EXCEPTION 'friend_limit';
  END IF;
  UPDATE public.friendships SET status = 'accepted', responded_at = now() WHERE id = f.id;
  RETURN 'accepted';
END $$;

-- ============ Ending ============
-- Either student can end a friendship; the asker can withdraw a waiting request.
CREATE OR REPLACE FUNCTION public.remove_friendship(_user_id uuid, _friendship_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.friendships x
   WHERE x.id = _friendship_id AND _user_id IN (x.requester_id, x.addressee_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'friendship_not_found'; END IF;
END $$;

-- ============ Reading ============
-- The student's friends, or the requests waiting for them ('incoming') or from them ('outgoing'):
-- the row's id, the other student's username and the date. Newest first.
CREATE OR REPLACE FUNCTION public.list_friendships(
  _user_id uuid, _kind text, _limit integer, _offset integer)
RETURNS TABLE (friendship_id uuid, username text, since timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _kind NOT IN ('friends', 'incoming', 'outgoing') THEN RAISE EXCEPTION 'invalid_list_kind'; END IF;
  RETURN QUERY
    SELECT f.id, COALESCE(p.username, 'Anonymous'), COALESCE(f.responded_at, f.created_at) AS since_at
      FROM public.friendships f
      JOIN public.profiles p
        ON p.id = CASE WHEN f.requester_id = _user_id THEN f.addressee_id ELSE f.requester_id END
     WHERE CASE _kind
             WHEN 'friends' THEN f.status = 'accepted' AND _user_id IN (f.requester_id, f.addressee_id)
             WHEN 'incoming' THEN f.status = 'pending' AND f.addressee_id = _user_id
             ELSE f.status = 'pending' AND f.requester_id = _user_id
           END
     ORDER BY since_at DESC, f.id
     LIMIT least(greatest(_limit, 1), 200) OFFSET greatest(_offset, 0);
END $$;

REVOKE ALL ON FUNCTION app_private.friend_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_friend(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_friend_request(uuid, uuid, boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_friendship(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_friendships(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_friend(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, uuid, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_friendship(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_friendships(uuid, text, integer, integer) TO service_role;
