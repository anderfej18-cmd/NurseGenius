// Validation and wording for the sign-in, sign-up and first-run profile forms. Pure functions, so the
// rules and the messages are tested without a browser. The rules are the ones the screens always had
// (email shape and length, a 6 to 72 character password, a username that starts with "Nurse");
// what changed is that each failure names its field and says how to fix it.

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export const EMAIL_MAX = 255;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthMode = "signin" | "signup";

export interface Credentials {
  email: string;
  password: string;
}

/** Field errors for the sign-in and sign-up forms. An empty object means the form can be sent. */
export function validateCredentials(
  { email, password }: Credentials,
  mode: AuthMode,
): FieldErrors<"email" | "password"> {
  const errors: FieldErrors<"email" | "password"> = {};
  const cleanEmail = email.trim();
  if (!cleanEmail) errors.email = "Enter your email address.";
  else if (cleanEmail.length > EMAIL_MAX || !EMAIL_SHAPE.test(cleanEmail))
    errors.email = "Enter an email address like name@example.com.";

  if (!password) {
    errors.password = mode === "signin" ? "Enter your password." : "Choose a password.";
  } else if (mode === "signup" && password.length < PASSWORD_MIN) {
    errors.password = `Choose a password with at least ${PASSWORD_MIN} characters.`;
  } else if (password.length > PASSWORD_MAX) {
    errors.password = `Use ${PASSWORD_MAX} characters or fewer.`;
  }
  return errors;
}

const KNOWN_AUTH_ERRORS: ReadonlyArray<[RegExp, string]> = [
  [/invalid login credentials/i, "That email and password do not match. Check them and try again."],
  [
    /already registered|already been registered/i,
    "An account with this email already exists. Sign in instead.",
  ],
  [/email not confirmed/i, "Confirm your email first. Open the link we sent you, then sign in."],
  [
    /rate limit|too many requests|over_email_send_rate_limit/i,
    "Too many attempts. Wait a few minutes and try again.",
  ],
  [/network|failed to fetch/i, "Could not reach NurseGenius. Check your connection and try again."],
];

/** Plain wording for what the sign-in service reports; anything unrecognised is passed through as sent. */
export function describeAuthError(message: string): string {
  for (const [pattern, text] of KNOWN_AUTH_ERRORS) if (pattern.test(message)) return text;
  return message || "Something went wrong. Please try again.";
}

export type ExamPreference = "RN" | "RM" | "Both";

export interface ProfileInput {
  first: string;
  last: string;
  username: string;
  examDate: string;
}

export type ProfileField = "first" | "last" | "username" | "examDate";

export const USERNAME_PATTERN = /^Nurse[A-Za-z0-9 _]{2,20}$/;

/** Collapse runs of spaces the way the saved username will be. */
export const cleanUsername = (value: string): string => value.trim().replace(/\s+/g, " ");

export function validateProfile(input: ProfileInput): FieldErrors<ProfileField> {
  const errors: FieldErrors<ProfileField> = {};
  if (!input.first.trim()) errors.first = "Enter your first name.";
  if (!input.last.trim()) errors.last = "Enter your last name.";
  if (!USERNAME_PATTERN.test(cleanUsername(input.username)))
    errors.username =
      "Start with Nurse, then add 2 to 20 letters, digits or spaces. For example: Nurse Alex.";
  if (!input.examDate) errors.examDate = "Choose the date of your exam.";
  return errors;
}

/** Postgres reports a duplicate username as 23505. */
export const USERNAME_TAKEN = "That username is taken. Try another.";
export const isUsernameTaken = (error: { code?: string }): boolean => error.code === "23505";
