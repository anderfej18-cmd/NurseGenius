import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/auth")({ component: AuthPage, head: () => ({ meta: [
  { title: "Sign In or Join — NurseGenius" }, { name: "description", content: "Sign in or create a NurseGenius account for RN and RM exam practice." },
  { property: "og:title", content: "Sign In or Join — NurseGenius" }, { property: "og:description", content: "Access RN and RM exam practice with a NurseGenius account." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }) });

const emailSchema = z.string().trim().email().max(255);
const pwSchema = z.string().min(6).max(72);

function AuthPage() {
  const { user, profile, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("ng.sharedTestAttempt");
      if (pending) setTestEmail((JSON.parse(pending) as { email?: string }).email ?? "");
    } catch { setTestEmail(""); }
  }, []);

  useEffect(() => {
    if (!loading && user) {
      if (sessionStorage.getItem("ng.sharedTestAttempt")) navigate({ to: "/onboarding" });
      else navigate({ to: isAdmin ? "/admin" : profile?.onboarded ? "/dashboard" : "/onboarding" });
    }
  }, [loading, user, profile, isAdmin, navigate]);

  return (
    <>
      <AppHeader />
      <main className="container mx-auto px-4 py-12 max-w-md">
        <Card className="p-6 bg-card-soft shadow-glow">
          <h1 className="text-2xl font-bold text-center">Welcome to NurseGenius</h1>
          <p className="text-center text-sm text-muted-foreground mt-1">Sign in or create an account</p>

          <Tabs defaultValue="signin" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin"><SignInForm initialEmail={testEmail} /></TabsContent>
            <TabsContent value="signup"><SignUpForm initialEmail={testEmail} /></TabsContent>
          </Tabs>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <GoogleButton />
        </Card>
      </main>
    </>
  );
}

function SignInForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (initialEmail) setEmail(initialEmail); }, [initialEmail]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(email); pwSchema.parse(password);
    } catch { toast.error("Enter a valid email and password"); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  };

  return (
    <form onSubmit={submit} className="space-y-3 mt-4">
      <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      <Button type="submit" disabled={busy} className="w-full bg-hero">Sign In</Button>
    </form>
  );
}

function SignUpForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (initialEmail) setEmail(initialEmail); }, [initialEmail]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(email); pwSchema.parse(password);
    } catch { toast.error("Email + password (min 6 chars) required"); return; }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Account created — check your email if confirmation required.");
  };

  return (
    <form onSubmit={submit} className="space-y-3 mt-4">
      <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
      <Button type="submit" disabled={busy} className="w-full bg-hero">Create Account</Button>
    </form>
  );
}

function GoogleButton() {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/onboarding` },
    });
    if (error) { toast.error(error.message); setBusy(false); }
  };
  return (
    <Button variant="outline" className="w-full" onClick={onClick} disabled={busy}>
      Continue with Google
    </Button>
  );
}
