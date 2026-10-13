// Checks for the study-plan form, so a bad value is explained next to its field before anything is
// sent. The server's schema is the authority (`studyPlanSchema`); a test keeps these ranges equal to it.

export const PLAN_LIMITS = {
  dailyMinutes: { min: 10, max: 240 },
  daysPerWeek: { min: 1, max: 7 },
  targetScore: { min: 50, max: 100 },
} as const;

export type PlanField = keyof typeof PLAN_LIMITS;

const NAMES: Record<PlanField, string> = {
  dailyMinutes: "Minutes a day",
  daysPerWeek: "Days a week",
  targetScore: "Target score",
};

export type PlanErrors = Partial<Record<PlanField, string>>;

/** One message per field that is not a whole number inside its range; an empty object means all is well. */
export function validatePlanSettings(values: Record<PlanField, number>): PlanErrors {
  const errors: PlanErrors = {};
  for (const field of Object.keys(PLAN_LIMITS) as PlanField[]) {
    const { min, max } = PLAN_LIMITS[field];
    const value = values[field];
    if (!Number.isInteger(value) || value < min || value > max)
      errors[field] = `${NAMES[field]} must be a whole number from ${min} to ${max}.`;
  }
  return errors;
}
