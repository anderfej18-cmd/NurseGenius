import { describe, expect, it, vi } from "vitest";
import { StreakService } from "./streak.service";

const NOW = new Date("2026-10-10T15:00:00.000Z");

const setup = (days: Array<{ day: string; answered: number }> = []) => {
  const store = { listStudyDays: vi.fn(async (_userId: string, _since: string) => days) };
  return { service: new StreakService({ store, clock: () => NOW }), store };
};

describe("StreakService.get", () => {
  it("reads only this student's days, from one window ago, and reports the streak", async () => {
    const { service, store } = setup([
      { day: "2026-10-09", answered: 6 },
      { day: "2026-10-10", answered: 5 },
    ]);
    const report = await service.get("user-1");

    // 366 days before 2026-10-10
    expect(store.listStudyDays).toHaveBeenCalledWith("user-1", "2025-10-09");
    expect(report).toMatchObject({ current: 2, studiedToday: true });
  });

  it("reports an empty streak for a new student", async () => {
    const { service } = setup();
    expect(await service.get("user-1")).toMatchObject({
      current: 0,
      longest: 0,
      lastStudyDay: null,
    });
  });
});
