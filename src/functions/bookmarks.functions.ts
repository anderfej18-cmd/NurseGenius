import { createServerFn } from "@tanstack/react-start";
import { validated } from "./validated";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addBookmarkSchema, listBookmarksSchema, removeBookmarkSchema } from "./bookmarks.schemas";

// Client-safe module (AGENTS.md): server code is loaded with a dynamic import inside each handler.

export const addBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(addBookmarkSchema))
  .handler(async ({ data, context }) => {
    const { bookmarkController } = await import("@/server/bookmarks/bookmark.controller.server");
    return bookmarkController.add(context.userId, data);
  });

export const removeBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(removeBookmarkSchema))
  .handler(async ({ data, context }) => {
    const { bookmarkController } = await import("@/server/bookmarks/bookmark.controller.server");
    return bookmarkController.remove(context.userId, data.questionId);
  });

export const listBookmarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validated(listBookmarksSchema))
  .handler(async ({ data, context }) => {
    const { bookmarkController } = await import("@/server/bookmarks/bookmark.controller.server");
    return bookmarkController.list(context.userId, data);
  });
