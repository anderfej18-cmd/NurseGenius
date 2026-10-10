import { ValidationError } from "@/lib/app-errors";
import { offsetBounds, toOffsetPage } from "../../pagination";
import type { OffsetPage } from "../../types";
import { FRIEND_CONFIG, type FriendConfig } from "./friend.config";

export type FriendListKind = "friends" | "incoming" | "outgoing";

/** One row of a friend list: the other student is only ever a username. */
export interface FriendshipEntry {
  readonly friendshipId: string;
  readonly username: string;
  /** When the request was made (waiting requests) or answered (friends). */
  readonly since: Date;
}

/** What this service needs from the rest of the system; declared here, next to its only consumer. */
interface Dependencies {
  readonly store: {
    requestFriend(
      userId: string,
      username: string,
      limits: { maxFriends: number; maxPending: number },
    ): Promise<{ friendshipId: string; status: "pending" | "accepted" }>;
    respond(
      userId: string,
      friendshipId: string,
      accept: boolean,
      maxFriends: number,
    ): Promise<"accepted" | "declined">;
    remove(userId: string, friendshipId: string): Promise<void>;
    list(
      userId: string,
      kind: FriendListKind,
      page: { limit: number; offset: number },
    ): Promise<readonly FriendshipEntry[]>;
  };
  readonly config?: FriendConfig;
}

/**
 * Friends: ask a student by username, answer a request, end a friendship, list them. The student is
 * always the one in the verified token; the database checks who may answer or end which row.
 * Rules in docs/formulas.md (section 14).
 */
export class FriendService {
  private readonly config: FriendConfig;

  constructor(private readonly deps: Dependencies) {
    this.config = deps.config ?? FRIEND_CONFIG;
  }

  async request(
    userId: string,
    input: { username: string },
  ): Promise<{ friendshipId: string; status: "pending" | "accepted" }> {
    const username = input.username.trim();
    if (username.length === 0 || username.length > this.config.maxUsernameLength) {
      throw new ValidationError("Enter the username of the student you want to add.");
    }
    return this.deps.store.requestFriend(userId, username, {
      maxFriends: this.config.maxFriends,
      maxPending: this.config.maxPendingRequests,
    });
  }

  async respond(
    userId: string,
    input: { friendshipId: string; accept: boolean },
  ): Promise<{ outcome: "accepted" | "declined" }> {
    const outcome = await this.deps.store.respond(
      userId,
      input.friendshipId,
      input.accept,
      this.config.maxFriends,
    );
    return { outcome };
  }

  async remove(userId: string, input: { friendshipId: string }): Promise<{ removed: true }> {
    await this.deps.store.remove(userId, input.friendshipId);
    return { removed: true };
  }

  async list(
    userId: string,
    request: { kind: FriendListKind; limit?: number; offset?: number },
  ): Promise<OffsetPage<FriendshipEntry>> {
    const { offset, limit } = offsetBounds(request);
    const rows = await this.deps.store.list(userId, request.kind, { limit: limit + 1, offset });
    return toOffsetPage([...rows], limit, offset);
  }
}
