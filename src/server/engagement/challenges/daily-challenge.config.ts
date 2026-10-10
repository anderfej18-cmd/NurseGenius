/** Rules of the daily challenge (documented in docs/formulas.md, section 12). */
export interface DailyChallengeConfig {
  /** Questions in a challenge; fewer if the bank has fewer complete questions. */
  readonly questions: number;
  /** Time allowed, in minutes. */
  readonly minutes: number;
}

export const DAILY_CHALLENGE_CONFIG = {
  questions: 5,
  minutes: 10,
} as const satisfies DailyChallengeConfig;
