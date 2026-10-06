import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Tier = "novice" | "erudite" | "scholar";
export type Role = "central_admin" | "admin" | "user";

export interface Profile {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  exam_date: string | null;
  exam_preference: "RN" | "RM" | "Both" | null;
  tier: Tier;
  expiry_date: string | null;
  questions_today: number;
  last_question_date: string | null;
  onboarded: boolean;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: Role[];
  loading: boolean;
  isAdmin: boolean;
  isCentralAdmin: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfileAndRoles = async (uid: string) => {
    // Auto-expire check
    await supabase.rpc("check_expire_tier", { _user_id: uid });
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((p as Profile) ?? null);
    setRoles((r ?? []).map((x: { role: Role }) => x.role));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setLoading(true);
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // Defer to avoid deadlock
        setTimeout(() => {
          loadProfileAndRoles(s.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) await loadProfileAndRoles(s.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async () => { if (user) await loadProfileAndRoles(user.id); };
  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <Ctx.Provider value={{
      user, session, profile, roles, loading,
      isAdmin: roles.includes("admin") || roles.includes("central_admin"),
      isCentralAdmin: roles.includes("central_admin"),
      refresh, signOut,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

export const TIER_LABEL: Record<Tier, string> = {
  novice: "Novice",
  erudite: "Erudite",
  scholar: "Scholar",
};
// Daily caps (null = unlimited)
export const TIER_DAILY_LIMIT: Record<Tier, number | null> = {
  novice: 50,
  erudite: 500,
  scholar: null,
};
// Per-session cap (max questions in one quiz)
export const TIER_SESSION_LIMIT: Record<Tier, number> = {
  novice: 50,
  erudite: 150,
  scholar: 250,
};
// Back-compat alias used by older components — represents the daily allowance ceiling shown in UI
export const TIER_LIMIT: Record<Tier, number> = {
  novice: 50,
  erudite: 500,
  scholar: 250,
};
