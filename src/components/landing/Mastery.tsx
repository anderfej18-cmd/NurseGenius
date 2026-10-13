import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { PROGRESS } from "@/lib/landing-content";
import { cn } from "@/lib/utils";

// A level's marker colour is a status colour, always read together with the level's name beside it.
const MARKER: Record<string, string> = {
  insufficient_data: "border-2 border-input bg-transparent",
  weak: "bg-destructive",
  developing: "bg-warning",
  proficient: "bg-info",
  mastered: "bg-success",
};

/** Mastery levels as a ladder: a legend for what a topic's level means, with no numbers about anyone. */
export function Mastery() {
  return (
    <section id="progress" className="scroll-mt-16 py-16 md:py-28">
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-start lg:gap-16">
        <Reveal className="lg:col-span-5">
          <SectionHeading title={PROGRESS.title} intro={PROGRESS.intro} />
          <p className="mt-6 text-base text-foreground">{PROGRESS.readiness}</p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {PROGRESS.extras.map((extra) => (
              <li
                key={extra}
                className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium text-foreground"
              >
                {extra}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal className="lg:col-span-7" index={1}>
          <h3 className="text-xl font-semibold">{PROGRESS.levelsTitle}</h3>
          <ol className="mt-6 flex flex-col gap-3">
            {PROGRESS.levels.map((level, index) => (
              <li
                key={level.level}
                className="flex items-start gap-4 rounded-lg border bg-card p-4 md:p-5"
                style={{ marginInlineStart: `clamp(0px, ${index * 2.5}vw, ${index * 28}px)` }}
              >
                <span
                  aria-hidden="true"
                  className={cn("mt-1.5 size-3.5 shrink-0 rounded-full", MARKER[level.level])}
                />
                <div>
                  <p className="font-semibold text-foreground">{level.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground md:text-base">
                    {level.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </Container>
    </section>
  );
}
