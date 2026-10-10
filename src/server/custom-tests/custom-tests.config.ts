/** Limits and bounds of shared tests (docs/api/custom-tests.md). */
export const CUSTOM_TEST_CONFIG = {
  minQuestions: 1,
  maxQuestions: 250,
  minDurationMinutes: 10,
  maxDurationMinutes: 180,
  /** A shared test is "passed" at this score; mirrored by the database summaries. */
  maxAttemptsListed: 100,
  limits: {
    /** Attempts one caller address may start, across all tests. */
    startPerAddress: { limit: 20, windowSeconds: 3600 },
    /** Attempts one email may start on one test. */
    startPerEmailAndTest: { limit: 5, windowSeconds: 86_400 },
    submitPerAddress: { limit: 30, windowSeconds: 3600 },
    viewPerAddress: { limit: 60, windowSeconds: 60 },
  },
} as const;
