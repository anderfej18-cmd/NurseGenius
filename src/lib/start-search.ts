import type { ExamType } from "./exam-type";
import { SELECTION_MODES, type SelectionMode } from "./session-modes";

export interface StartSearch {
  readonly examType?: ExamType;
  readonly topic?: string;
  readonly selection?: SelectionMode;
  /** The question to find similar ones to; with it the selection is always "similar". */
  readonly similarTo?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a link into the exam-start screen may preset: a topic and how questions are chosen. Anything
 * else in the address is dropped, so a malformed link opens the screen with its normal defaults.
 */
export function parseStartSearch(raw: Record<string, unknown>): StartSearch {
  const { topic, selection, examType, similarTo } = raw;
  const question = typeof similarTo === "string" && UUID.test(similarTo) ? similarTo : null;
  if (question !== null) {
    return {
      ...(examType === "RN" || examType === "RM" ? { examType } : {}),
      ...(typeof topic === "string" && topic.trim() !== "" && topic.length <= 200 ? { topic } : {}),
      selection: "similar",
      similarTo: question,
    };
  }
  return {
    ...(examType === "RN" || examType === "RM" ? { examType } : {}),
    ...(typeof topic === "string" && topic.trim() !== "" && topic.length <= 200 ? { topic } : {}),
    ...(typeof selection === "string" &&
    SELECTION_MODES.some((mode) => mode === selection) &&
    selection !== "similar"
      ? { selection: selection as SelectionMode }
      : {}),
  };
}
