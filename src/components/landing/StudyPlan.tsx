import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { PLAN } from "@/lib/landing-content";

const WEEK_TICKS = 12;

/** The plan works backwards from an exam date. The line is a diagram of that idea, not anyone's plan. */
export function StudyPlan() {
  return (
    <section id="plan" className="scroll-mt-16 py-16 md:py-28">
      <Container>
        <Reveal>
          <SectionHeading title={PLAN.title} intro={PLAN.intro} />
        </Reveal>

        <Reveal index={1} className="mt-12 md:mt-16">
          <div aria-hidden="true" className="relative">
            <div className="flex items-end justify-between text-sm font-medium text-foreground">
              <span>{PLAN.timeline.start}</span>
              <span>{PLAN.timeline.end}</span>
            </div>
            <div className="relative mt-3 h-6">
              <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
              <div className="absolute inset-0 flex items-center justify-between">
                {Array.from({ length: WEEK_TICKS + 1 }, (_, index) => (
                  <span
                    key={index}
                    className={
                      index === 0 || index === WEEK_TICKS
                        ? "size-3 rounded-full bg-primary"
                        : "h-3 w-px bg-input"
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-10 md:mt-16 md:grid-cols-3 md:gap-8">
          {PLAN.points.map((point, index) => (
            <Reveal key={point.title} index={index}>
              <h3 className="text-lg font-semibold">{point.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground md:text-base">{point.body}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
