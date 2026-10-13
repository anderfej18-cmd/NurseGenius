import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { HOW_IT_WORKS } from "@/lib/landing-content";

/** A real sequence, so it is numbered: a line runs through four steps on a wide screen and down the side on a phone. */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 py-16 md:py-28">
      <Container>
        <Reveal>
          <SectionHeading title={HOW_IT_WORKS.title} intro={HOW_IT_WORKS.intro} />
        </Reveal>
        <ol className="relative mt-12 grid grid-cols-1 gap-10 md:mt-16 md:grid-cols-4 md:gap-8">
          <span
            aria-hidden="true"
            className="absolute bottom-2 left-5 top-2 w-px bg-border md:hidden"
          />
          <span
            aria-hidden="true"
            className="absolute left-5 right-5 top-5 hidden h-px bg-border md:block"
          />
          {HOW_IT_WORKS.steps.map((step, index) => (
            <Reveal key={step.title} as="li" index={index} className="relative pl-14 md:pl-0">
              <span className="absolute left-0 top-0 flex size-10 items-center justify-center rounded-md bg-primary font-mono text-sm font-semibold text-primary-foreground md:static">
                {index + 1}
              </span>
              <h3 className="text-lg font-semibold md:mt-5">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground md:text-base">{step.body}</p>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}
