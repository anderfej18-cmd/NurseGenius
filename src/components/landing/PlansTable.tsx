import { useEffect, useState } from "react";
import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { Skeleton } from "@/components/ui/skeleton";
import { listPublicPlans } from "@/functions/plans.functions";
import { PLANS_SECTION } from "@/lib/landing-content";
import type { Tier } from "@/lib/exam-rules";
import type { PublicPlan } from "@/lib/plans";

type PlansState =
  | { status: "loading" }
  | { status: "ready"; plans: PublicPlan[] }
  | { status: "unavailable" };

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

/** The active plans, from the public server function. A failure is shown honestly, never papered over. */
function usePublicPlans(): PlansState {
  const [state, setState] = useState<PlansState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    listPublicPlans({ data: {} }).then(
      (plans) => {
        if (!cancelled) setState({ status: "ready", plans });
      },
      () => {
        if (!cancelled) setState({ status: "unavailable" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function PriceCell({ tier, state }: { tier: Tier; state: PlansState }) {
  if (state.status === "loading") return <Skeleton className="mx-auto h-5 w-20" />;
  // Novice is the free starting plan, so it reads "Free" whether or not the database has a row for it.
  if (tier === "novice") return <>{PLANS_SECTION.free}</>;
  const plan = state.status === "ready" ? state.plans.find((c) => c.name === tier) : undefined;
  return <>{plan ? naira.format(plan.priceNgn) : PLANS_SECTION.signInForPrice}</>;
}

function AccessCell({ tier, state }: { tier: Tier; state: PlansState }) {
  if (tier === "novice") return <>{PLANS_SECTION.noExpiry}</>;
  if (state.status === "loading") return <Skeleton className="mx-auto h-5 w-16" />;
  const plan = state.status === "ready" ? state.plans.find((c) => c.name === tier) : undefined;
  return <>{plan ? `${plan.durationDays} days` : PLANS_SECTION.signInForPrice}</>;
}

/** A comparison table with real columns. Limits are the app's own rules; price and length are read live. */
export function PlansTable() {
  const state = usePublicPlans();
  const { rows, tiers } = PLANS_SECTION;
  return (
    <section id="plans" className="scroll-mt-16 bg-card py-16 md:py-28 border-y border-divider">
      <Container>
        <Reveal>
          <SectionHeading title={PLANS_SECTION.title} intro={PLANS_SECTION.intro} />
        </Reveal>
        <Reveal index={1} className="mt-10 md:mt-14">
          <div className="overflow-x-auto rounded-xl border bg-background">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm md:text-base">
              <caption className="sr-only">What each plan allows and costs</caption>
              <thead>
                <tr className="border-b border-divider">
                  <th scope="col" className="w-[34%] px-5 py-4">
                    <span className="sr-only">{PLANS_SECTION.featureColumn}</span>
                  </th>
                  {tiers.map((tier) => (
                    <th
                      key={tier}
                      scope="col"
                      className="px-5 py-4 text-center font-display text-lg font-semibold"
                    >
                      {PLANS_SECTION.tierLabel(tier)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                <tr>
                  <th scope="row" className="px-5 py-4 font-medium text-muted-foreground">
                    {rows.perDay}
                  </th>
                  {tiers.map((tier) => (
                    <td key={tier} className="px-5 py-4 text-center font-mono tabular-nums">
                      {PLANS_SECTION.dailyLimit(tier)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="px-5 py-4 font-medium text-muted-foreground">
                    {rows.perTest}
                  </th>
                  {tiers.map((tier) => (
                    <td key={tier} className="px-5 py-4 text-center font-mono tabular-nums">
                      {PLANS_SECTION.testLimit(tier)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="px-5 py-4 font-medium text-muted-foreground">
                    {rows.price}
                  </th>
                  {tiers.map((tier) => (
                    <td key={tier} className="px-5 py-4 text-center font-medium tabular-nums">
                      <PriceCell tier={tier} state={state} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="px-5 py-4 font-medium text-muted-foreground">
                    {rows.length}
                  </th>
                  {tiers.map((tier) => (
                    <td key={tier} className="px-5 py-4 text-center">
                      <AccessCell tier={tier} state={state} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
