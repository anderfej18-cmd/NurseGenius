import { offsetBounds, toOffsetPage } from "../pagination";

export type UserTier = "novice" | "erudite" | "scholar";

/** All a sub-admin may see of a student: how they are listed, and what they pay for. */
export interface DirectoryUser {
  readonly username: string | null;
  readonly tier: UserTier;
}

export interface TierTotals {
  readonly novice: number;
  readonly erudite: number;
  readonly scholar: number;
  readonly all: number;
}

interface Dependencies {
  readonly store: {
    list(page: { limit: number; offset: number }): Promise<readonly DirectoryUser[]>;
    countByTier(): Promise<ReadonlyArray<{ tier: UserTier; total: number }>>;
  };
}

/**
 * The sub-admin user directory: a username and a tier, nothing else, with the totals per tier.
 * The caller is checked as an admin by the controller before this runs.
 */
export class UserDirectoryService {
  constructor(private readonly deps: Dependencies) {}

  async get(request: {
    limit?: number;
    offset?: number;
  }): Promise<{ users: DirectoryUser[]; nextOffset: number | null; totals: TierTotals }> {
    const { offset, limit } = offsetBounds(request);
    const [rows, counts] = await Promise.all([
      this.deps.store.list({ limit: limit + 1, offset }),
      this.deps.store.countByTier(),
    ]);
    const page = toOffsetPage([...rows], limit, offset);
    return { users: page.items, nextOffset: page.nextOffset, totals: totalsOf(counts) };
  }
}

function totalsOf(counts: ReadonlyArray<{ tier: UserTier; total: number }>): TierTotals {
  const of = (tier: UserTier) => counts.find((count) => count.tier === tier)?.total ?? 0;
  const [novice, erudite, scholar] = [of("novice"), of("erudite"), of("scholar")];
  return { novice, erudite, scholar, all: novice + erudite + scholar };
}
