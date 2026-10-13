import { Link } from "@tanstack/react-router";
import { QuestionHelp } from "@/components/QuestionHelp";
import { QuestionPreview } from "@/components/QuestionPreview";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export interface TestResultItem {
  question_id: string;
  question_position: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  rationale: string | null;
  user_answer: string | null;
  is_correct: boolean;
}
export interface TestResult {
  score: number;
  correct: number;
  total: number;
  results: TestResultItem[];
}

/**
 * What a shared test shows after it is submitted: the score the server worked out, a way to keep the
 * result (sign in, or finish the profile), and every question with the right answer and explanation.
 * AI help is offered only when the result is saved to the signed-in account of a student who has finished
 * onboarding; a guest attempt has none.
 */
export function SharedTestResult({
  title,
  result,
  email,
  signedIn,
  onboarded,
  linked,
  claimMessage,
  attempt,
  onSaveAttempt,
  onCompleteProfile,
}: {
  title: string;
  result: TestResult;
  email: string;
  signedIn: boolean;
  onboarded: boolean;
  /** The attempt is saved to the signed-in account (the server checked a confirmed matching email). */
  linked: boolean;
  /** Why a signed-in person's result could not be saved to their account, when it could not. */
  claimMessage: string | null;
  attempt: { attemptId: string; accessKey: string } | null;
  /** Remember the attempt so signing in can link it to the account. */
  onSaveAttempt: () => void;
  onCompleteProfile: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-6">
        <p className="text-sm text-muted-foreground">{title}</p>
        <h1 className="text-3xl font-bold">Your result</h1>
        <p className="font-sans text-5xl font-semibold leading-none">
          {result.score}%
          <span className="ml-3 text-base font-normal text-muted-foreground">
            {result.correct} of {result.total} correct
          </span>
        </p>
        <Progress value={result.score} aria-label={`Score ${result.score} percent`} />
      </Card>
      {signedIn && !onboarded && (
        <Card className="flex flex-col items-start gap-3 p-5">
          <h2 className="font-sans text-lg font-semibold tracking-normal">Complete your profile</h2>
          <p className="text-sm text-muted-foreground">
            Save this result to your NurseGenius account and unlock your study tools.
          </p>
          <Button onClick={onCompleteProfile}>Complete profile</Button>
        </Card>
      )}
      {signedIn && !linked && claimMessage && (
        <Alert variant="warning">
          <AlertDescription>{claimMessage}</AlertDescription>
        </Alert>
      )}
      {!signedIn && (
        <Card className="flex flex-col items-start gap-3 p-5">
          <h2 className="font-sans text-lg font-semibold tracking-normal">
            Save your result and complete your profile
          </h2>
          <p className="text-sm text-muted-foreground">
            Create an account or sign in using {email}; your completed test can then be linked to
            it.
          </p>
          <Button asChild>
            <Link to="/auth" onClick={onSaveAttempt}>
              Complete profile
            </Link>
          </Button>
        </Card>
      )}
      <section aria-labelledby="review-heading" className="flex flex-col gap-4">
        <h2 id="review-heading" className="font-sans text-xl font-semibold tracking-normal">
          Answer review
        </h2>
        <ol className="flex flex-col gap-4">
          {result.results.map((entry, index) => (
            <li key={entry.question_id}>
              <Card className="flex flex-col gap-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-muted-foreground">Question {index + 1}</p>
                  <Badge variant={entry.is_correct ? "success" : "secondary"}>
                    {entry.is_correct ? "Correct" : entry.user_answer ? "Wrong" : "Skipped"}
                  </Badge>
                </div>
                <QuestionPreview
                  text={entry.question_text}
                  options={{
                    A: entry.option_a,
                    B: entry.option_b,
                    C: entry.option_c,
                    D: entry.option_d,
                  }}
                  correct={entry.correct_answer}
                  chosen={entry.user_answer}
                />
                {entry.rationale && (
                  <p className="rounded-md bg-sunken p-3 text-sm">
                    <span className="font-semibold">Why: </span>
                    {entry.rationale}
                  </p>
                )}
                {signedIn && onboarded && linked && attempt && (
                  <QuestionHelp
                    where={{
                      kind: "shared",
                      attemptId: attempt.attemptId,
                      accessKey: attempt.accessKey,
                    }}
                    questionId={entry.question_id}
                    answeredWrong={!entry.is_correct && Boolean(entry.user_answer)}
                    rationale={entry.rationale}
                  />
                )}
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
