# Bookmarks

Source: `src/functions/bookmarks.functions.ts` → `src/server/bookmarks/`. Table `bookmarks`, unique on `(user_id, question_id)`.

## addBookmark
- **Request**: `{ questionId: uuid, note?: string ≤ 500 }`
- **Response**: `{ ok: true }`
- **Errors**: 404 unknown or retired question · 429 limit of 2,000 bookmarks
- **Business rules**: idempotent; bookmarking again updates the note. A blank note is stored as none. Editing an existing bookmark is allowed at the limit.

## removeBookmark
- **Request**: `{ questionId: uuid }` → **Response**: `{ removed: boolean }` (idempotent; only the caller's bookmark can match)

## listBookmarks
- **Request**: `{ examType?, topic?, limit?: 1–50, offset?: 0–10,000 }`
- **Response**: `{ items: [{ questionId, note, createdAt, examType, topic, question: { question_text, option_a..d } }], nextOffset }` — newest first, never the answer key.
