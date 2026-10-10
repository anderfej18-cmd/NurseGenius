import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "../errors";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("./ai-insights.container.server", () => ({ createAiInsights: () => ({ get }) }));

import { aiInsightsController } from "./ai-insights.controller.server";

beforeEach(() => vi.clearAllMocks());

describe("aiInsightsController.getInsight", () => {
  it("asks for the signed-in student's explanation, passing the study time through", async () => {
    get.mockResolvedValueOnce({ kind: "recommendation" });
    await aiInsightsController.getInsight("user-1", {
      kind: "recommendation",
      availableMinutes: 40,
    });
    expect(get).toHaveBeenCalledWith("user-1", "recommendation", {
      availableMinutes: 40,
      examType: undefined,
    });
  });

  it("passes the exam type through for the readiness", async () => {
    get.mockResolvedValueOnce({ kind: "readiness" });
    await aiInsightsController.getInsight("user-1", { kind: "readiness", examType: "RM" });
    expect(get).toHaveBeenCalledWith("user-1", "readiness", {
      availableMinutes: undefined,
      examType: "RM",
    });
  });

  it("lets a typed error through unchanged", async () => {
    get.mockRejectedValueOnce(new ForbiddenError("no"));
    await expect(
      aiInsightsController.getInsight("u", { kind: "readiness" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("answers an unexpected failure generically, without its text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    get.mockRejectedValueOnce(new Error("relation ai_insights does not exist (password=hunter2)"));
    const error = await aiInsightsController
      .getInsight("u", { kind: "readiness" })
      .catch((e: unknown) => e);
    expect((error as Error).message).toBe("Something went wrong. Please try again.");
  });
});
