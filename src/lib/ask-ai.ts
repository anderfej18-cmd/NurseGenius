import { supabase } from "@/integrations/supabase/client";

export type HelpIntent = "explain" | "simplify" | "compare_options" | "why_wrong";

/** What kind of help is wanted, and an optional short question of the student's own. */
export interface HelpRequest {
  intent?: HelpIntent;
  followUp?: string;
}

/** What the AI explainer may be asked about: a question the caller has already seen the answer to. */
export type ExplanationTarget = HelpRequest &
  (
    | { kind: "exam"; examId: string; questionId: string }
    | { kind: "shared"; attemptId: string; accessKey: string; questionId: string }
  );

export const FOLLOW_UP_MIN = 3;
export const FOLLOW_UP_MAX = 300;

const CHOICES: ReadonlyArray<{ intent: HelpIntent; label: string }> = [
  { intent: "explain", label: "Explain" },
  { intent: "simplify", label: "Simplify" },
  { intent: "compare_options", label: "Compare the options" },
  { intent: "why_wrong", label: "Why was I wrong?" },
];

/** The kinds of help to offer; "why was I wrong" only makes sense for a wrong answer. */
export const helpChoicesFor = (answeredWrong: boolean) =>
  CHOICES.filter((choice) => choice.intent !== "why_wrong" || answeredWrong);

/** What is wrong with a follow-up question, or null if it can be sent (an empty box is simply not sent). */
export function followUpProblem(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (trimmed.length < FOLLOW_UP_MIN) return `Write at least ${FOLLOW_UP_MIN} characters.`;
  if (trimmed.length > FOLLOW_UP_MAX) return `Keep it to ${FOLLOW_UP_MAX} characters or fewer.`;
  return null;
}

const FALLBACK = "The AI tutor could not answer. Please try again.";

/**
 * Asks the `ask-ai` Edge Function to explain one question. Only identifiers are sent: the function
 * reads the question and its key from the database itself (ADR-0006). Failures become the
 * function's own safe message, never a transport error string.
 */
export async function requestExplanation(target: ExplanationTarget): Promise<string> {
  const { data, error } = await supabase.functions.invoke("ask-ai", { body: target });
  if (error) throw new Error(await messageFrom(error));
  const explanation = (data as { explanation?: unknown } | null)?.explanation;
  return typeof explanation === "string" && explanation.length > 0 ? explanation : FALLBACK;
}

async function messageFrom(error: unknown): Promise<string> {
  const response = (error as { context?: unknown }).context;
  if (response instanceof Response) {
    try {
      const body: unknown = await response.json();
      const message = (body as { error?: unknown }).error;
      if (typeof message === "string" && message.length > 0) return message;
    } catch {
      // not JSON: fall through to the generic message
    }
  }
  return FALLBACK;
}
