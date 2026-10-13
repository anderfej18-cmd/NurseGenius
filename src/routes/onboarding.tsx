import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { claimSharedTestAttempt } from "@/functions/custom-tests.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  USERNAME_TAKEN,
  cleanUsername,
  isUsernameTaken,
  validateProfile,
  type ExamPreference,
  type FieldErrors,
  type ProfileField,
} from "@/lib/auth-forms";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
  head: () => ({
    meta: [
      { title: "Set up your profile | NurseGenius" },
      { name: "description", content: "Set up your nursing study profile and exam preferences." },
      { property: "og:title", content: "Set up your profile | NurseGenius" },
      {
        property: "og:description",
        content: "Set up your nursing study profile and exam preferences.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PANEL_POINTS = [
  "Your exam date lets NurseGenius build a plan that works back from it",
  "Your username is how friends find you; it must start with Nurse",
  "You can practise RN, RM or both, and choose again each time you start a test",
] as const;

const EXAM_CHOICES: ReadonlyArray<{ value: ExamPreference; label: string; detail: string }> = [
  { value: "RN", label: "RN", detail: "Registered Nurse" },
  { value: "RM", label: "RM", detail: "Registered Midwife" },
  { value: "Both", label: "Both", detail: "RN and RM" },
];

/** Move focus to the first field that failed, once React has marked it invalid. */
function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}

function Onboarding() {
  const { user, profile, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const claimAttempt = useServerFn(claimSharedTestAttempt);
  const formRef = useRef<HTMLFormElement>(null);
  const examLegendId = useId();

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [username, setUsername] = useState("Nurse");
  const [examDate, setExamDate] = useState("");
  const [pref, setPref] = useState<ExamPreference>("RN");
  const [errors, setErrors] = useState<FieldErrors<ProfileField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Someone who has already finished setting up never repeats it: link any pending shared-test
  // result, then go to the dashboard.
  useEffect(() => {
    if (!loading) {
      if (!user) navigate({ to: "/auth" });
      else if (profile?.onboarded) {
        void (async () => {
          const pending = sessionStorage.getItem("ng.sharedTestAttempt");
          if (pending) {
            try {
              const attempt = JSON.parse(pending) as { attemptId?: string; accessKey?: string };
              if (attempt.attemptId && attempt.accessKey)
                await claimAttempt({
                  data: { attemptId: attempt.attemptId, accessKey: attempt.accessKey },
                });
              sessionStorage.removeItem("ng.sharedTestAttempt");
            } catch {
              /* Keep the profile flow usable even if the result cannot be linked. */
            }
          }
          navigate({ to: "/dashboard" });
        })();
      }
    }
    // `claimAttempt` is deliberately not a dependency: the redirect must run when the person's state
    // changes, not whenever the server-function wrapper is re-created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, profile, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!user) {
      setFormError("Sign in to save your profile.");
      return;
    }
    const found = validateProfile({ first, last, username, examDate });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }

    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: first.trim(),
        last_name: last.trim(),
        username: cleanUsername(username),
        exam_date: examDate,
        exam_preference: pref,
        onboarded: true,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      if (isUsernameTaken(error)) {
        setErrors({ username: USERNAME_TAKEN });
        focusFirstInvalid(formRef.current);
      } else {
        setFormError(error.message);
      }
      return;
    }
    await refresh();
    const pending = sessionStorage.getItem("ng.sharedTestAttempt");
    if (pending) {
      try {
        const attempt = JSON.parse(pending) as { attemptId?: string; accessKey?: string };
        if (attempt.attemptId && attempt.accessKey)
          await claimAttempt({
            data: { attemptId: attempt.attemptId, accessKey: attempt.accessKey },
          });
        sessionStorage.removeItem("ng.sharedTestAttempt");
      } catch {
        toast.error("Profile saved. This test result could not be linked to your account.");
      }
    }
    toast.success("Profile saved.");
    navigate({ to: "/dashboard" });
  };

  return (
    <AuthShell
      title="Set up your profile"
      description="A few details so NurseGenius can plan around your exam."
      panelTitle="One last step before your first test"
      points={PANEL_POINTS}
    >
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="First name" error={errors.first} required>
            {(control) => (
              <Input
                {...control}
                name="given-name"
                autoComplete="given-name"
                maxLength={50}
                value={first}
                onChange={(event) => setFirst(event.target.value)}
              />
            )}
          </Field>
          <Field label="Last name" error={errors.last} required>
            {(control) => (
              <Input
                {...control}
                name="family-name"
                autoComplete="family-name"
                maxLength={50}
                value={last}
                onChange={(event) => setLast(event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field
          label="Username"
          error={errors.username}
          hint="Starts with Nurse, for example Nurse Alex. Friends find you by it."
          required
        >
          {(control) => (
            <Input
              {...control}
              name="username"
              autoComplete="off"
              spellCheck={false}
              maxLength={25}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          )}
        </Field>

        <Field label="Exam date" error={errors.examDate} required>
          {(control) => (
            <Input
              {...control}
              type="date"
              name="exam-date"
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
            />
          )}
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend id={examLegendId} className="text-sm font-medium">
            Which exam are you preparing for?
          </legend>
          <RadioGroup
            value={pref}
            onValueChange={(value) => setPref(value as ExamPreference)}
            aria-labelledby={examLegendId}
            className="grid grid-cols-3 gap-2"
          >
            {EXAM_CHOICES.map((choice) => {
              const inputId = `${examLegendId}-${choice.value}`;
              return (
                <label
                  key={choice.value}
                  htmlFor={inputId}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-md border bg-card p-3 transition-colors duration-150 pointer-coarse:min-h-11",
                    "has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <RadioGroupItem id={inputId} value={choice.value} />
                    {choice.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{choice.detail}</span>
                </label>
              );
            })}
          </RadioGroup>
        </fieldset>

        {formError && <Alert variant="destructive">{formError}</Alert>}

        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Save and continue
        </Button>
      </form>
    </AuthShell>
  );
}
