import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  describeAuthError,
  validateCredentials,
  type AuthMode,
  type FieldErrors,
} from "@/lib/auth-forms";

export const Route = createFileRoute("/auth")({
  // `?mode=signup` opens the sign-up form (the landing page's "Get started"); anything else is sign in.
  // The parameter is optional so every existing link to /auth keeps working unchanged.
  validateSearch: (search: Record<string, unknown>): { mode?: AuthMode } =>
    search.mode === "signup" ? { mode: "signup" } : {},
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in or create an account | NurseGenius" },
      {
        name: "description",
        content: "Sign in or create a NurseGenius account for RN and RM exam practice.",
      },
      { property: "og:title", content: "Sign in or create an account | NurseGenius" },
      {
        property: "og:description",
        content: "Access RN and RM exam practice with a NurseGenius account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PANEL_POINTS = [
  "Correct answers and the reasoning behind them, after every test",
  "A study plan that follows your own results",
  "Free to start, with no card needed",
] as const;

type CredentialErrors = FieldErrors<"email" | "password">;

/** Move focus to the first field that failed validation, once React has marked it invalid. */
function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}

function AuthPage() {
  const { user, profile, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  const [testEmail, setTestEmail] = useState("");

  // A shared test taken before signing in leaves its email here so the result can be linked later.
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("ng.sharedTestAttempt");
      if (pending) setTestEmail((JSON.parse(pending) as { email?: string }).email ?? "");
    } catch {
      setTestEmail("");
    }
  }, []);

  useEffect(() => {
    if (!loading && user) {
      if (sessionStorage.getItem("ng.sharedTestAttempt")) navigate({ to: "/onboarding" });
      else navigate({ to: isAdmin ? "/admin" : profile?.onboarded ? "/dashboard" : "/onboarding" });
    }
  }, [loading, user, profile, isAdmin, navigate]);

  return (
    <AuthShell
      title="Welcome to NurseGenius"
      description="Sign in, or create an account to start practising."
      panelTitle="Pick up where your results left off"
      points={PANEL_POINTS}
    >
      {testEmail && (
        <Alert variant="info" className="mb-6">
          Use the same email you used for the shared test ({testEmail}) so its result can be added
          to your account.
        </Alert>
      )}

      <Tabs defaultValue={mode ?? "signin"}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>
        <TabsContent value="signin">
          <CredentialsForm mode="signin" initialEmail={testEmail} />
        </TabsContent>
        <TabsContent value="signup">
          <CredentialsForm mode="signup" initialEmail={testEmail} />
        </TabsContent>
      </Tabs>

      <div className="my-6 flex items-center gap-3" role="separator" aria-label="or">
        <div className="h-px flex-1 bg-divider" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-divider" />
      </div>

      <GoogleButton />
    </AuthShell>
  );
}

/** One form for both modes: the fields, the rules and the wording differ only where they must. */
function CredentialsForm({ mode, initialEmail }: { mode: AuthMode; initialEmail: string }) {
  const signingUp = mode === "signup";
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setCreated(false);
    const found = validateCredentials({ email, password }, mode);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }
    setBusy(true);
    const cleanEmail = email.trim();
    const { error } = signingUp
      ? await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/onboarding` },
        })
      : await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setBusy(false);
    if (error) setFormError(describeAuthError(error.message));
    else if (signingUp) setCreated(true);
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="mt-6 flex flex-col gap-5">
      <Field label="Email" error={errors.email} required>
        {(control) => (
          <Input
            {...control}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            autoCapitalize="none"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </Field>
      <Field
        label="Password"
        error={errors.password}
        hint={signingUp ? "At least 6 characters." : undefined}
        required
      >
        {(control) => (
          <PasswordInput
            {...control}
            name="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </Field>

      {formError && <Alert variant="destructive">{formError}</Alert>}
      {created && (
        <Alert variant="success">
          Account created. If your email needs confirming, open the link we sent you, then sign in.
        </Alert>
      )}

      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {signingUp ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}

function GoogleButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onClick = async () => {
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/onboarding` },
    });
    if (failure) {
      setError(describeAuthError(failure.message));
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" size="lg" className="w-full" onClick={onClick} loading={busy}>
        Continue with Google
      </Button>
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
