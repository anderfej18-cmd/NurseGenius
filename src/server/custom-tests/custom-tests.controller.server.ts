import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { assertAdmin } from "../access/admin-access.server";
import { guard } from "../errors";
import { SupabaseRateLimiter } from "../rate-limit/rate-limiter.repository.server";
import { SupabaseCustomTestStore } from "./custom-tests.repository.server";
import { type NewCustomTest, CustomTestService } from "./custom-tests.service";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const service = () =>
  new CustomTestService({
    store: new SupabaseCustomTestStore(supabaseAdmin),
    limiter: new SupabaseRateLimiter(supabaseAdmin),
    digest: sha256Hex,
    clock: () => new Date(),
  });

interface Caller {
  userId: string;
  supabase: SupabaseClient<Database>;
}

/** Admin operations check `is_any_admin` first, through the one shared helper. */
const asAdmin = <T>(caller: Caller, operation: (adminId: string) => Promise<T>) =>
  guard(async () => {
    await assertAdmin(caller.supabase, caller.userId);
    return operation(caller.userId);
  });

export const customTestController = {
  create: (caller: Caller, input: NewCustomTest) =>
    asAdmin(caller, (adminId) => service().create(adminId, input)),
  list: (caller: Caller) => asAdmin(caller, (adminId) => service().list(adminId)),
  republish: (caller: Caller, input: { testId: string; tokenHash: string; expiresAt: string }) =>
    asAdmin(caller, (adminId) => service().republish(adminId, input)),
  importToBank: (caller: Caller, input: { testId: string; topic: string }) =>
    asAdmin(caller, (adminId) => service().importToBank(adminId, input)),

  // Public: the link token and the attempt key are the credentials.
  getShared: (input: { tokenHash: string }, address: string) =>
    guard(() => service().getShared(input, address)),
  startShared: (input: { tokenHash: string; email: string; accessKey: string }, address: string) =>
    guard(() => service().startShared(input, address)),
  submitShared: (
    input: {
      attemptId: string;
      accessKey: string;
      answers: Array<{ question_id: string; user_answer: string | null }>;
    },
    address: string,
  ) => guard(() => service().submitShared(input, address)),

  claim: (
    user: { userId: string; email: string | undefined },
    input: { attemptId: string; accessKey: string },
  ) => guard(() => service().claim(user.userId, user.email, input)),
};
