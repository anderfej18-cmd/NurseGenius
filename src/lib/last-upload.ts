// The last question file an admin imported, remembered on this device only so the Add Questions page can
// say what happened last time. It is a convenience: unreadable or missing storage just means nothing shown.

export interface LastUpload {
  fileName: string;
  examType: "RN" | "RM";
  topic: string;
  imported: number;
  at: string;
}

export const LAST_UPLOAD_KEY = "ng.lastQuestionUpload";

const isLastUpload = (value: unknown): value is LastUpload => {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.fileName === "string" &&
    (entry.examType === "RN" || entry.examType === "RM") &&
    typeof entry.topic === "string" &&
    typeof entry.imported === "number" &&
    typeof entry.at === "string"
  );
};

/** The remembered upload, or null when there is none or what is stored is not an upload record. */
export function readLastUpload(storage: Pick<Storage, "getItem">): LastUpload | null {
  try {
    const raw = storage.getItem(LAST_UPLOAD_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLastUpload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Remembers the upload; storage that is full or blocked is ignored. */
export function saveLastUpload(storage: Pick<Storage, "setItem">, upload: LastUpload): void {
  try {
    storage.setItem(LAST_UPLOAD_KEY, JSON.stringify(upload));
  } catch {
    /* the note is a convenience; not saving it changes nothing else */
  }
}
