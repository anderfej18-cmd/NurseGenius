import { Check } from "lucide-react";
import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { PRACTICE } from "@/lib/landing-content";

/** The exam workflow: the rules of a test on the left (it stays in view on a wide screen) and the four ways to choose questions on the right. */
export function Practice() {
  return (
    <section id="practice" className="scroll-mt-16 bg-card py-16 md:py-28 border-y border-divider">
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <SectionHeading title={PRACTICE.title} intro={PRACTICE.intro} />
            <ul className="mt-8 flex flex-col gap-4">
              {PRACTICE.rules.map((rule) => (
                <li key={rule} className="flex gap-3 text-sm text-foreground md:text-base">
                  <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal className="lg:col-span-7" index={1}>
          <h3 className="text-xl font-semibold">{PRACTICE.modesTitle}</h3>
          <dl className="mt-6 divide-y divide-divider rounded-lg border bg-background">
            {PRACTICE.modes.map((mode) => (
              <div
                key={mode.label}
                className="grid grid-cols-1 gap-1 px-5 py-5 sm:grid-cols-5 sm:gap-6"
              >
                <dt className="text-base font-semibold sm:col-span-2">{mode.label}</dt>
                <dd className="text-sm text-muted-foreground sm:col-span-3 md:text-base">
                  {mode.hint}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>
    </section>
  );
}
