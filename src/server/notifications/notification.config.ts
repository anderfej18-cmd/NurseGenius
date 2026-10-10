/** Rules of notification delivery (documented in docs/formulas.md, section 15). */
export interface NotificationConfig {
  /** Most notifications handed to the providers in one delivery run. */
  readonly batchSize: number;
  /** A notification is given up on after this many delivery attempts. */
  readonly maxAttempts: number;
  /** A notification handed out but not confirmed delivered is handed out again after this long. */
  readonly staleAfterSeconds: number;
}

export const NOTIFICATION_CONFIG = {
  batchSize: 50,
  maxAttempts: 5,
  staleAfterSeconds: 300,
} as const satisfies NotificationConfig;
