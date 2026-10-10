import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guard } from "../errors";
import { SupabaseBookmarkRepository } from "./bookmark.repository.server";
import { BookmarkService } from "./bookmark.service";
import type { BookmarkListRequest } from "./bookmark.types";

const service = () => new BookmarkService(new SupabaseBookmarkRepository(supabaseAdmin));

export const bookmarkController = {
  add: (userId: string, input: { questionId: string; note?: string }) =>
    guard(() => service().add(userId, input)),
  remove: (userId: string, questionId: string) => guard(() => service().remove(userId, questionId)),
  list: (userId: string, request: BookmarkListRequest) =>
    guard(() => service().list(userId, request)),
};
