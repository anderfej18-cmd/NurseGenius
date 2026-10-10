// Small pure helpers for the admin question screens, kept out of the components so they are tested.

/** "a, b ,, A" → ["a", "b"]: trimmed, blanks dropped, repeats (any case) dropped, order kept. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(",")) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export const formatTags = (tags: readonly string[]): string => tags.join(", ");

export type Difficulty = "easy" | "medium" | "hard";

/** The select's text as a difficulty; anything else (the "not set" option) is null. */
export function toDifficulty(value: string): Difficulty | null {
  return value === "easy" || value === "medium" || value === "hard" ? value : null;
}

interface Editable {
  readonly difficulty: Difficulty | null;
  readonly tags: readonly string[];
  readonly subtopicId: string | null;
}

/** The fields of an edit that differ from the original, so a save sends no more than the admin changed. */
type Changes = Partial<{
  difficulty: Difficulty | null;
  tags: string[];
  subtopicId: string | null;
}>;

export function changedFields(original: Editable, edited: Editable): Changes {
  const changes: Changes = {};
  if (edited.difficulty !== original.difficulty) changes.difficulty = edited.difficulty;
  if (edited.subtopicId !== original.subtopicId) changes.subtopicId = edited.subtopicId;
  if (
    edited.tags.length !== original.tags.length ||
    edited.tags.some((tag, i) => tag !== original.tags[i])
  ) {
    changes.tags = [...edited.tags];
  }
  return changes;
}
