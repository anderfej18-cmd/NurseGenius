// Synthetic people for the harness. They exist only here; the real application never imports this file.
import type { Profile, Role } from "@/hooks/use-auth";

/** A string present in every fixture, so a test can prove none reaches a production build. */
export const FIXTURE_MARKER = "ng-visual-fixture";

export type Persona = "student" | "admin" | "central_admin" | "new_student" | "signed_out";

const today = new Date().toISOString().slice(0, 10);
const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const profile = (overrides: Partial<Profile>): Profile => ({
  id: `${FIXTURE_MARKER}-user`,
  email: `student@${FIXTURE_MARKER}.example`,
  first_name: "Test",
  last_name: "Student",
  username: "Nurse Test",
  exam_date: inDays(90),
  exam_preference: "Both",
  tier: "erudite",
  expiry_date: inDays(20),
  questions_today: 120,
  last_question_date: today,
  onboarded: true,
  ...overrides,
});

const PROFILES: Record<Exclude<Persona, "signed_out">, { profile: Profile; roles: Role[] }> = {
  student: { profile: profile({}), roles: ["user"] },
  new_student: {
    profile: profile({
      first_name: null,
      last_name: null,
      username: null,
      exam_date: null,
      tier: "novice",
      expiry_date: null,
      questions_today: 0,
      last_question_date: null,
      onboarded: false,
    }),
    roles: ["user"],
  },
  admin: { profile: profile({ first_name: "Test", last_name: "Admin" }), roles: ["admin"] },
  central_admin: {
    profile: profile({ first_name: "Test", last_name: "Owner", tier: "scholar" }),
    roles: ["central_admin"],
  },
};

/** What the stub Supabase client returns for the session and the person's own rows. */
export function identityFor(persona: Persona) {
  if (persona === "signed_out") return { session: null, tables: {} as Record<string, unknown[]> };
  const { profile: own, roles } = PROFILES[persona];
  return {
    session: {
      access_token: FIXTURE_MARKER,
      user: { id: own.id, email: own.email },
    },
    tables: {
      profiles: [own],
      user_roles: roles.map((role) => ({ role })),
      plans: [
        {
          id: "fixture-plan-1",
          name: "Erudite",
          price_ngn: 3000,
          duration_days: 30,
          is_active: true,
        },
        {
          id: "fixture-plan-2",
          name: "Scholar",
          price_ngn: 7500,
          duration_days: 90,
          is_active: true,
        },
      ],
      subscription_payments: [
        {
          id: "fixture-payment-1",
          user_id: own.id,
          plan_name: "Erudite",
          amount_ngn: 3000,
          duration_days: 30,
          created_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        },
      ],
    } as Record<string, unknown[]>,
  };
}
