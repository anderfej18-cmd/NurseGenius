import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { Badge } from "@/components/ui/badge";
import { AI } from "@/lib/landing-content";

/** What the AI does, and the line it does not cross. The two labels are the ones the app itself puts on its summaries. */
export function AiHelp() {
  return (
    <section id="ai" className="scroll-mt-16 bg-card py-16 md:py-28 border-y border-divider">
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-5">
          <SectionHeading title={AI.title} />
          <p className="mt-6 rounded-lg bg-sunken p-4 text-sm text-foreground md:text-base">
            {AI.boundary}
          </p>
        </Reveal>

        <div className="flex flex-col gap-6 lg:col-span-7">
          <Reveal index={1}>
            <div className="rounded-xl border bg-background p-6 md:p-8">
              <h3 className="text-xl font-semibold">{AI.help.title}</h3>
              <p className="mt-3 text-sm text-muted-foreground md:text-base">{AI.help.body}</p>
            </div>
          </Reveal>
          <Reveal index={2}>
            <div className="rounded-xl border bg-background p-6 md:p-8">
              <h3 className="text-xl font-semibold">{AI.summaries.title}</h3>
              <p className="mt-3 text-sm text-muted-foreground md:text-base">{AI.summaries.body}</p>
              <ul
                className="mt-5 flex flex-wrap gap-2"
                aria-label="The two labels a summary can carry"
              >
                <li>
                  <Badge variant="info">{AI.summaries.labels[0]}</Badge>
                </li>
                <li>
                  <Badge variant="secondary">{AI.summaries.labels[1]}</Badge>
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
