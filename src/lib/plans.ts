// The shape of a plan as shown to anyone, shared by the server function that supplies it and the
// pages that show it. Pure types: importable from both sides.

/** One active plan as the landing page may show it to a visitor with no account. */
export interface PublicPlan {
  readonly name: string;
  readonly priceNgn: number;
  readonly durationDays: number;
}
