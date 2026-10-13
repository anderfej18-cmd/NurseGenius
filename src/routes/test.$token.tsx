import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SharedTestResult, type TestResult } from "@/components/shared-test/SharedTestResult";
import { SharedTestShell } from "@/components/shared-test/SharedTestShell";
import { TestGate } from "@/components/shared-test/TestGate";
import { TestRunner } from "@/components/shared-test/TestRunner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  claimSharedTestAttempt,
  getSharedAttempt,
  getSharedTest,
  startSharedTest,
  submitSharedTest,
} from "@/functions/custom-tests.functions";
import { useAuth } from "@/hooks/use-auth";
import { clockOffset } from "@/lib/shared-test-clock";
import {
  HANDOFF_KEY,
  forgetAttempt,
  readStoredAttempt,
  rememberAttempt,
} from "@/lib/shared-attempt-store";
import { createShareToken } from "@/lib/share-token";

export const Route = createFileRoute("/test/$token")({
  component: SharedTestPage,
  head: () => ({
    meta: [
      { title: "Shared nursing practice test | NurseGenius" },
      {
        name: "description",
        content: "Complete a timed shared nursing practice test on NurseGenius.",
      },
      { property: "og:title", content: "Shared nursing practice test | NurseGenius" },
      {
        property: "og:description",
        content: "Complete a timed shared nursing practice test on NurseGenius.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type TestState = Awaited<ReturnType<typeof getSharedTest>>;
type Attempt = Awaited<ReturnType<typeof getSharedAttempt>>;

interface Session {
  attemptId: string;
  accessKey: string;
  email: string;
}

const hashOf = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/**
 * The public page behind a test link: a countdown before it opens, the email form while it is open, one
 * question at a time while it is taken, and the result with explanations. Everything that matters (state,
 * clock, deadline, answers, score) comes from the server; this page keeps only the attempt key, so a reload
 * or a return visit resumes the attempt.
 */
function SharedTestPage() {
  const { token } = Route.useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [info, setInfo] = useState<TestState | null>(null);
  const [offset, setOffset] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [linked, setLinked] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadInfo = useCallback(async (hash: string) => {
    try {
      const state = await getSharedTest({ data: { tokenHash: hash } });
      setOffset(clockOffset(state.serverNow, Date.now()));
      setInfo(state);
    } catch (error) {
      setInfo({ state: "closed", serverNow: new Date().toISOString(), test: null });
      toast.error(error instanceof Error ? error.message : "Could not load this test.");
    }
  }, []);

  // Open the page: read the link's state and, if this device already started an attempt, pick it up.
  useEffect(() => {
    let active = true;
    void (async () => {
      const hash = await hashOf(token);
      if (!active) return;
      setTokenHash(hash);
      await loadInfo(hash);
      const stored = readStoredAttempt(localStorage, hash);
      if (stored === null || !active) return;
      try {
        const resumed = await getSharedAttempt({
          data: { attemptId: stored.attemptId, accessKey: stored.accessKey },
        });
        if (!active) return;
        setOffset(clockOffset(resumed.serverNow, Date.now()));
        setSession(stored);
        setAttempt(resumed);
        setLinked(resumed.linked);
        if (resumed.result) setResult(resumed.result);
      } catch {
        forgetAttempt(localStorage, hash);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, loadInfo]);

  const start = async (email: string) => {
    if (tokenHash === null) return;
    setBusy(true);
    try {
      // A fresh 192-bit secret is the attempt key; only its hash ever reaches the database.
      const { token: accessKey } = await createShareToken();
      const started = await startSharedTest({ data: { tokenHash, email, accessKey } });
      const next = { attemptId: started.attemptId, accessKey, email: email.trim().toLowerCase() };
      rememberAttempt(localStorage, tokenHash, next);
      setOffset(clockOffset(started.attempt.serverNow, Date.now()));
      setSession(next);
      setAttempt(started.attempt);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start this test.");
      if (tokenHash) await loadInfo(tokenHash);
    }
    setBusy(false);
  };

  const claim = useCallback(
    async (current: Session) => {
      if (!user) return;
      try {
        const { claimed } = await claimSharedTestAttempt({
          data: { attemptId: current.attemptId, accessKey: current.accessKey },
        });
        setLinked(claimed);
        if (claimed) sessionStorage.removeItem(HANDOFF_KEY);
        else setClaimMessage("This result already belongs to an account.");
      } catch (error) {
        // The result stays on screen; the reason (an unconfirmed or different email) is said plainly.
        setClaimMessage(
          error instanceof Error
            ? error.message
            : "This result could not be saved to your account.",
        );
      }
    },
    [user],
  );

  // A signed-in visitor's finished attempt is linked to their account once, when both are known.
  useEffect(() => {
    if (result && session && user && !linked && claimMessage === null) void claim(session);
  }, [result, session, user, linked, claimMessage, claim]);

  const submit = async (answers: Array<{ question_id: string; user_answer: string | null }>) => {
    if (!session) return;
    setBusy(true);
    try {
      const submitted = await submitSharedTest({
        data: { attemptId: session.attemptId, accessKey: session.accessKey, answers },
      });
      setResult(submitted);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit the test.");
      // The attempt may have been closed by the clock meanwhile: ask the server what it holds.
      try {
        const current = await getSharedAttempt({
          data: { attemptId: session.attemptId, accessKey: session.accessKey },
        });
        setAttempt(current);
        if (current.result) setResult(current.result);
      } catch {
        /* the message above stands */
      }
    }
    setBusy(false);
  };

  const saveForSignIn = () => {
    if (session) sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(session));
  };

  if (info === null)
    return (
      <SharedTestShell>
        <div aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">Loading the test</span>
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-48 w-full" />
        </div>
      </SharedTestShell>
    );

  if (result && attempt && session)
    return (
      <SharedTestShell width="max-w-4xl">
        <SharedTestResult
          title={attempt.test.title}
          result={result}
          email={session.email}
          signedIn={Boolean(user)}
          onboarded={Boolean(profile?.onboarded)}
          linked={linked}
          claimMessage={claimMessage}
          attempt={{ attemptId: session.attemptId, accessKey: session.accessKey }}
          onSaveAttempt={saveForSignIn}
          onCompleteProfile={() => {
            saveForSignIn();
            void navigate({ to: "/onboarding" });
          }}
        />
      </SharedTestShell>
    );

  if (attempt && session && attempt.status === "in_progress")
    return (
      <TestRunner
        attemptId={session.attemptId}
        accessKey={session.accessKey}
        view={attempt}
        offset={offset}
        submitting={busy}
        onSubmit={(answers) => void submit(answers)}
      />
    );

  return (
    <SharedTestShell width="max-w-2xl">
      <TestGate
        info={info}
        offset={offset}
        defaultEmail={user?.email ?? ""}
        busy={busy}
        onStart={(email) => void start(email)}
        onRefresh={() => {
          if (tokenHash) void loadInfo(tokenHash);
        }}
      />
    </SharedTestShell>
  );
}
