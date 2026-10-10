-- Milestone 3 / admin content management: questions and subtopics are written only by the server.
--
-- Until now an admin's browser inserted, updated and DELETED questions directly (admin RLS policies
-- plus table grants). Deleting a question that students have answered is blocked by a foreign key
-- today, but nothing stopped an admin session from rewriting an answer key or content outside the
-- server's validation. Writes now go through server functions that check is_any_admin, validate
-- the question, and retire instead of deleting (so past attempts stay valid). Clients keep
-- read access exactly as the Milestone 1 migration set it (column grants, active questions only).

DROP POLICY IF EXISTS "admins insert questions" ON public.questions;
DROP POLICY IF EXISTS "admins update questions" ON public.questions;
DROP POLICY IF EXISTS "admins delete questions" ON public.questions;

REVOKE INSERT, UPDATE, DELETE ON public.questions FROM anon, authenticated;
