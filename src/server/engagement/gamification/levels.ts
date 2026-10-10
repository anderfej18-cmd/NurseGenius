import { GAMIFICATION_CONFIG, type GamificationConfig } from "./gamification.config";

export interface LevelProgress {
  readonly level: number;
  readonly totalXp: number;
  /** XP earned since this level started. */
  readonly xpIntoLevel: number;
  /** XP between the start of this level and the next; null at the maximum level. */
  readonly xpForNextLevel: number | null;
  /** 0 to 1 through the current level; 1 at the maximum level. */
  readonly progress: number;
}

type LevelConfig = GamificationConfig["levels"];

/** Total XP at which `level` starts: baseXp × (level − 1) × level / 2. */
export function xpRequiredForLevel(
  level: number,
  config: LevelConfig = GAMIFICATION_CONFIG.levels,
): number {
  return (config.baseXp * (level - 1) * level) / 2;
}

/** The level a total of XP has reached, and how far through it the student is. Pure. */
export function levelFromXp(
  totalXp: number,
  config: LevelConfig = GAMIFICATION_CONFIG.levels,
): LevelProgress {
  const xp = Math.max(0, totalXp);
  // Closed form for the largest n with baseXp·n·(n−1)/2 <= xp, then corrected for rounding.
  let level = Math.floor((1 + Math.sqrt(1 + (8 * xp) / config.baseXp)) / 2);
  level = Math.min(config.maxLevel, Math.max(1, level));
  while (level < config.maxLevel && xpRequiredForLevel(level + 1, config) <= xp) level += 1;
  while (level > 1 && xpRequiredForLevel(level, config) > xp) level -= 1;

  const start = xpRequiredForLevel(level, config);
  if (level === config.maxLevel) {
    return { level, totalXp: xp, xpIntoLevel: xp - start, xpForNextLevel: null, progress: 1 };
  }
  const span = xpRequiredForLevel(level + 1, config) - start;
  return {
    level,
    totalXp: xp,
    xpIntoLevel: xp - start,
    xpForNextLevel: span,
    progress: (xp - start) / span,
  };
}
