import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { createShareToken } from "@/lib/share-token";
import { assertAdmin } from "../access/admin-access.server";
import { guard } from "../errors";
import { SupabaseRateLimiter } from "../rate-limit/rate-limiter.repository.server";
import type { ExamType } from "../types";
import { SupabaseCustomTestStore } from "./custom-tests.repository.server";
import {
  type Actor,
  type NewLiveTest,
  type Schedule,
  type SubmittedAnswer,
  CustomTestService,
} from "./custom-tests.service";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The address the identity provider has confirmed for this account, or null when it has not. */
async function verifiedEmailOf(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) throw error;
  const user = data.user;
  return user.email && user.email_confirmed_at ? user.email : null;
}

const service = () =>
  new CustomTestService({
    store: new SupabaseCustomTestStore(supabaseAdmin),
    limiter: new SupabaseRateLimiter(supabaseAdmin),
    digest: sha256Hex,
    newLink: createShareToken,
    verifiedEmailOf,
    clock: () => new Date(),
  });

interface Caller {
  userId: string;
  supabase: SupabaseClient<Database>;
}

/**
 * Admin operations check `is_any_admin` first, through the one shared helper, then work out whether the
 * caller is the central admin (the database repeats both checks for every operation).
 */
const asAdmin = <T>(caller: Caller, operation: (actor: Actor) => Promise<T>) =>
  guard(async () => {
    await assertAdmin(caller.supabase, caller.userId);
    const { data, error } = await caller.supabase.rpc("has_role", {
      _user_id: caller.userId,
      _role: "central_admin",
    });
    if (error) throw error;
    return operation({ id: caller.userId, central: data === true });
  });

export const customTestController = {
  create: (caller: Caller, input: NewLiveTest) =>
    asAdmin(caller, (actor) => service().create(actor.id, input)),
  list: (caller: Caller) => asAdmin(caller, (actor) => service().list(actor)),
  republish: (caller: Caller, input: { testId: string } & Schedule) =>
    asAdmin(caller, (actor) => service().republish(actor, input)),
  importToBank: (caller: Caller, input: { testId: string; examType: ExamType; topic: string }) =>
    asAdmin(caller, (actor) => service().importToBank(actor, input)),

  // Public: the link token and the attempt key are the credentials.
  getShared: (input: { tokenHash: string }, address: string) =>
    guard(() => service().getShared(input, address)),
  startShared: (input: { tokenHash: string; email: string; accessKey: string }, address: string) =>
    guard(() => service().startShared(input, address)),
  getAttempt: (input: { attemptId: string; accessKey: string }, address: string) =>
    guard(() => service().getAttempt(input, address)),
  saveAnswer: (input: {
    attemptId: string;
    accessKey: string;
    questionId: string;
    answer: string | null;
    flagged: boolean;
  }) => guard(() => service().saveAnswer(input)),
  submitShared: (
    input: { attemptId: string; accessKey: string; answers: SubmittedAnswer[] },
    address: string,
  ) => guard(() => service().submitShared(input, address)),

  claim: (user: { userId: string }, input: { attemptId: string; accessKey: string }) =>
    guard(() => service().claim(user.userId, input)),
};
