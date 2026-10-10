import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { examTypeSchema } from "@/lib/exam-type";
import type { Database, Json } from "@/integrations/supabase/types";
import type { StudyPlanDraft } from "./study-plan";
import type { StoredStudyPlan } from "./study-plan.service";

const COLUMNS =
  "exam_type, exam_date, starts_on, daily_minutes, days_per_week, target_score, questions_per_day, plan, created_at";

const count = z.number().int().min(0);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const itemSchema = z.object({
  weekIndex: count,
  kind: z.enum(["topic", "review", "mock_exam"]),
  topic: z.string().nullable(),
  questions: count,
  // Plans stored before this field existed read as "not recorded".
  mastery: z.number().min(0).max(100).nullable().default(null),
});
const weekSchema = z.object({
  index: count,
  startsOn: date,
  endsOn: date,
  kind: z.enum(["learn", "final"]),
  questionBudget: count,
  items: z.array(itemSchema),
});
const planDocumentSchema = z.object({
  weeks: z.array(weekSchema).min(1),
  summary: z.object({
    totalQuestions: count,
    learnQuestions: count,
    unallocatedQuestions: count,
    unscheduledTopics: z.array(z.string()),
  }),
});

const rowSchema = z.object({
  exam_type: examTypeSchema,
  exam_date: date,
  starts_on: date,
  daily_minutes: z.number().int(),
  days_per_week: z.number().int(),
  target_score: z.number().int(),
  questions_per_day: z.number().int(),
  plan: planDocumentSchema,
  created_at: z.coerce.date(),
});

/**
 * Reads and replaces a student's study plan. Service-role client: every query names the student, and
 * a student has at most one plan.
 */
export class SupabaseStudyPlanStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getPlan(userId: string): Promise<StoredStudyPlan | null> {
    const { data, error } = await this.db
      .from("study_plans")
      .select(COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data === null) return null;

    const row = rowSchema.parse(data);
    return {
      examType: row.exam_type,
      settings: {
        dailyMinutes: row.daily_minutes,
        daysPerWeek: row.days_per_week,
        targetScore: row.target_score,
      },
      draft: {
        startsOn: row.starts_on,
        examDate: row.exam_date,
        questionsPerDay: row.questions_per_day,
        weeks: row.plan.weeks,
        summary: row.plan.summary,
      },
      createdAt: row.created_at,
    };
  }

  async savePlan(userId: string, plan: StoredStudyPlan): Promise<void> {
    const { draft, settings } = plan;
    const { error } = await this.db.from("study_plans").upsert(
      {
        user_id: userId,
        exam_type: plan.examType,
        exam_date: draft.examDate,
        starts_on: draft.startsOn,
        daily_minutes: settings.dailyMinutes,
        days_per_week: settings.daysPerWeek,
        target_score: settings.targetScore,
        questions_per_day: draft.questionsPerDay,
        plan: toDocument(draft),
        created_at: plan.createdAt.toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
  }

  /** The exam date lives on the student's profile; the plan only remembers the date it was made for. */
  async setExamDate(userId: string, examDate: string): Promise<void> {
    const { error } = await this.db
      .from("profiles")
      .update({ exam_date: examDate })
      .eq("id", userId);
    if (error) throw error;
  }
}

/** The part of a plan stored as a document; the dates and the daily size have columns of their own. */
function toDocument(draft: StudyPlanDraft): Json {
  return {
    weeks: draft.weeks.map((week) => ({
      index: week.index,
      startsOn: week.startsOn,
      endsOn: week.endsOn,
      kind: week.kind,
      questionBudget: week.questionBudget,
      items: week.items.map((item) => ({
        weekIndex: item.weekIndex,
        kind: item.kind,
        topic: item.topic,
        questions: item.questions,
        mastery: item.mastery,
      })),
    })),
    summary: {
      totalQuestions: draft.summary.totalQuestions,
      learnQuestions: draft.summary.learnQuestions,
      unallocatedQuestions: draft.summary.unallocatedQuestions,
      unscheduledTopics: [...draft.summary.unscheduledTopics],
    },
  };
}
