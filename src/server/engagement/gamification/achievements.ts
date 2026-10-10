import {
  type AchievementDefinition,
  GAMIFICATION_CONFIG,
  type GamificationConfig,
  type SnapshotMetric,
} from "./gamification.config";

/** The counters the achievement rules read, gathered by the server. */
export type EngagementSnapshot = Readonly<Record<SnapshotMetric, number>>;

export type AchievementUnlock = Pick<
  AchievementDefinition,
  "code" | "title" | "description" | "xp"
>;

export interface AchievementProgress extends AchievementUnlock {
  readonly unlocked: boolean;
  readonly current: number;
  readonly target: number;
  /** 0 to 1. */
  readonly progress: number;
}

const unlockOf = ({ code, title, description, xp }: AchievementDefinition): AchievementUnlock => ({
  code,
  title,
  description,
  xp,
});

/**
 * The achievements the snapshot has newly earned, in the order they are defined. Pure; an
 * achievement already unlocked is never returned again, so recording the result makes the next
 * evaluation empty. Rules in docs/formulas.md (section 11).
 */
export function evaluateAchievements(
  snapshot: EngagementSnapshot,
  unlockedCodes: readonly string[],
  config: GamificationConfig = GAMIFICATION_CONFIG,
): AchievementUnlock[] {
  const unlocked = new Set(unlockedCodes);
  return config.achievements
    .filter((a) => !unlocked.has(a.code) && snapshot[a.metric] >= a.atLeast)
    .map(unlockOf);
}

/** Every achievement with how close the student is: what the locked ones need, what is done. */
export function achievementProgress(
  snapshot: EngagementSnapshot,
  unlockedCodes: readonly string[],
  config: GamificationConfig = GAMIFICATION_CONFIG,
): AchievementProgress[] {
  const unlocked = new Set(unlockedCodes);
  return config.achievements.map((a) => {
    const current = snapshot[a.metric];
    const done = unlocked.has(a.code);
    return {
      ...unlockOf(a),
      unlocked: done,
      current,
      target: a.atLeast,
      progress: done ? 1 : Math.min(1, current / a.atLeast),
    };
  });
}
