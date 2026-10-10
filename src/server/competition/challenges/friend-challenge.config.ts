/** Rules of friend challenges (documented in docs/formulas.md, section 14). */
export interface FriendChallengeConfig {
  /** Questions in a challenge; fewer if the bank has fewer complete questions. */
  readonly questions: number;
  /** Time allowed for each student's session, in minutes. */
  readonly minutes: number;
  /** How long after it is set a challenge can still be started. */
  readonly expiresInDays: number;
  /** Most challenges a student can have waiting for the other student to start. */
  readonly maxOpen: number;
}

export const FRIEND_CHALLENGE_CONFIG = {
  questions: 10,
  minutes: 15,
  expiresInDays: 7,
  maxOpen: 10,
} as const satisfies FriendChallengeConfig;
