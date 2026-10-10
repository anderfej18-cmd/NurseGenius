import { describe, expect, it } from "vitest";
import { listNotificationsSchema, markNotificationsReadSchema } from "./notifications.schemas";

const ID = "6f1c2f6e-0a53-4a54-9d3b-6a6f2b7a0c11";

describe("listNotificationsSchema", () => {
  it.each([[{}], [{ unreadOnly: true, limit: 50, offset: 10_000 }], [{ limit: 1, offset: 0 }]])(
    "accepts %j",
    (payload) => {
      expect(listNotificationsSchema.safeParse(payload).success).toBe(true);
    },
  );

  it.each([
    [{ limit: 0 }],
    [{ limit: 51 }],
    [{ limit: 1.5 }],
    [{ offset: -1 }],
    [{ offset: 10_001 }],
    [{ unreadOnly: "yes" }],
    [{ userId: "someone-else" }],
    [{ readAt: null }],
  ])("rejects %j", (payload) => {
    expect(listNotificationsSchema.safeParse(payload).success).toBe(false);
  });
});

describe("markNotificationsReadSchema", () => {
  it("accepts no ids (all unread) or up to 100 ids", () => {
    expect(markNotificationsReadSchema.safeParse({}).success).toBe(true);
    expect(markNotificationsReadSchema.safeParse({ ids: [ID] }).success).toBe(true);
    expect(markNotificationsReadSchema.safeParse({ ids: Array(100).fill(ID) }).success).toBe(true);
  });

  it.each([
    [{ ids: [] }],
    [{ ids: Array(101).fill(ID) }],
    [{ ids: ["not-a-uuid"] }],
    [{ ids: ID }],
    [{ ids: [ID], userId: "someone-else" }],
  ])("rejects %j", (payload) => {
    expect(markNotificationsReadSchema.safeParse(payload).success).toBe(false);
  });
});
