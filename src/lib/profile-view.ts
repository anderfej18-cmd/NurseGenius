// What the profile screen shows, as labelled facts. Pure and tested. Nothing is invented: a missing
// value reads "Not set". The limits come from the shared tier rules, not from here.
import { TIER_LABEL } from "./exam-rules";
import { examCountdown } from "./progress-view";

export interface ProfileSource {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  email: string | null;
  exam_preference: "RN" | "RM" | "Both" | null;
  exam_date: string | null;
  tier: "novice" | "erudite" | "scholar";
  expiry_date: string | null;
  questions_today: number;
  last_question_date: string | null;
}

export interface ProfileFact {
  label: string;
  value: string;
}

const NOT_SET = "Not set";
const DAY_MS = 24 * 60 * 60 * 1000;

const dateText = (isoDate: string): string =>
  new Date(isoDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const preferenceText = (preference: ProfileSource["exam_preference"]): string =>
  preference === null ? NOT_SET : preference === "Both" ? "RN and RM" : preference;

export function profileFacts(
  profile: ProfileSource,
  now: Date,
  dailyLimit: number | null,
  sessionLimit: number,
): { details: ProfileFact[]; plan: ProfileFact[] } {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  const today = now.toISOString().slice(0, 10);
  const usedToday = profile.last_question_date === today ? profile.questions_today : 0;
  const daysToExam =
    profile.exam_date === null
      ? null
      : Math.round((Date.parse(profile.exam_date) - Date.parse(today)) / DAY_MS);

  return {
    details: [
      { label: "Name", value: name === "" ? NOT_SET : name },
      { label: "Username", value: profile.username ?? NOT_SET },
      { label: "Email", value: profile.email ?? NOT_SET },
      { label: "Studying for", value: preferenceText(profile.exam_preference) },
      {
        label: "Exam date",
        value:
          profile.exam_date === null
            ? NOT_SET
            : `${dateText(profile.exam_date)} · ${examCountdown(daysToExam)}`,
      },
    ],
    plan: [
      { label: "Plan", value: TIER_LABEL[profile.tier] },
      {
        label: "Access until",
        value: profile.expiry_date === null ? "No end date" : dateText(profile.expiry_date),
      },
      {
        label: "Questions today",
        value:
          dailyLimit === null ? `${usedToday} (no daily limit)` : `${usedToday} of ${dailyLimit}`,
      },
      { label: "Largest test", value: `${sessionLimit} questions` },
    ],
  };
}
