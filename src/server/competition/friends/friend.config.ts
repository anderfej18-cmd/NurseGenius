/** Limits on friendships (documented in docs/formulas.md, section 14). */
export interface FriendConfig {
  /** Most friends a student can have. */
  readonly maxFriends: number;
  /** Most friend requests a student can have waiting for an answer. */
  readonly maxPendingRequests: number;
  /** Longest username a request can name. */
  readonly maxUsernameLength: number;
}

export const FRIEND_CONFIG = {
  maxFriends: 200,
  maxPendingRequests: 20,
  maxUsernameLength: 50,
} as const satisfies FriendConfig;
