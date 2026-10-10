import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { mapDbError } from "../../db-errors";
import type { FriendListKind, FriendshipEntry } from "./friend.service";

const requestRowSchema = z.object({
  friendship_id: z.string(),
  status: z.enum(["pending", "accepted"]),
});
const outcomeSchema = z.enum(["accepted", "declined"]);
const listRowSchema = z.object({
  friendship_id: z.string(),
  username: z.string(),
  since: z.coerce.date(),
});

/**
 * Friendships. Service-role client: the database functions take the student explicitly and check who
 * may answer or end which row, and no student can read the table directly.
 */
export class SupabaseFriendStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async requestFriend(
    userId: string,
    username: string,
    limits: { maxFriends: number; maxPending: number },
  ): Promise<{ friendshipId: string; status: "pending" | "accepted" }> {
    const { data, error } = await this.db.rpc("request_friend", {
      _user_id: userId,
      _username: username,
      _max_friends: limits.maxFriends,
      _max_pending: limits.maxPending,
    });
    if (error) throw mapDbError(error);
    const [row] = z.array(requestRowSchema).min(1).parse(data);
    return { friendshipId: row.friendship_id, status: row.status };
  }

  async respond(
    userId: string,
    friendshipId: string,
    accept: boolean,
    maxFriends: number,
  ): Promise<"accepted" | "declined"> {
    const { data, error } = await this.db.rpc("respond_friend_request", {
      _user_id: userId,
      _friendship_id: friendshipId,
      _accept: accept,
      _max_friends: maxFriends,
    });
    if (error) throw mapDbError(error);
    return outcomeSchema.parse(data);
  }

  async remove(userId: string, friendshipId: string): Promise<void> {
    const { error } = await this.db.rpc("remove_friendship", {
      _user_id: userId,
      _friendship_id: friendshipId,
    });
    if (error) throw mapDbError(error);
  }

  async list(
    userId: string,
    kind: FriendListKind,
    page: { limit: number; offset: number },
  ): Promise<FriendshipEntry[]> {
    const { data, error } = await this.db.rpc("list_friendships", {
      _user_id: userId,
      _kind: kind,
      _limit: page.limit,
      _offset: page.offset,
    });
    if (error) throw error;
    return z
      .array(listRowSchema)
      .parse(data)
      .map((row) => ({
        friendshipId: row.friendship_id,
        username: row.username,
        since: row.since,
      }));
  }
}
