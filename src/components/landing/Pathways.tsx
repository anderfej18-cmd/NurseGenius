import { Check } from "lucide-react";
import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { PATHWAYS, type Pathway } from "@/lib/landing-content";
import { cn } from "@/lib/utils";

// RN is the wider, taller panel and RM sits lower and narrower: the two programmes are different
// things, not a matched pair of cards. The pathway colours appear here and on RN/RM labels only.
const STYLE: Record<Pathway["code"], { tile: string; code: string; check: string }> = {
  RN: { tile: "bg-rn-soft", code: "text-rn-text", check: "text-rn-text" },
  RM: { tile: "bg-rm-soft", code: "text-rm-text", check: "text-rm-text" },
};

function PathwayPanel({ pathway, className }: { pathway: Pathway; className?: string }) {
  const style = STYLE[pathway.code];
  return (
    <div className={cn("rounded-xl border bg-card p-6 shadow-sm md:p-8", className)}>
      <div className={cn("flex items-baseline gap-4 rounded-lg px-5 py-4", style.tile)}>
        <span className={cn("font-display text-5xl font-bold tracking-tight", style.code)}>
          {pathway.code}
        </span>
        <span className="text-base font-medium text-foreground">{pathway.name}</span>
      </div>
      <p className="mt-6 text-base text-foreground">{pathway.summary}</p>
      <ul className="mt-5 flex flex-col gap-3">
        {pathway.points.map((point) => (
          <li key={point} className="flex gap-3 text-sm text-muted-foreground md:text-base">
            <Check aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", style.check)} />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pathways() {
  const [rn, rm] = PATHWAYS.items;
  return (
    <section id="pathways" className="scroll-mt-16 py-16 md:py-28">
      <Container>
        <Reveal>
          <SectionHeading title={PATHWAYS.title} intro={PATHWAYS.intro} />
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-6 md:mt-16 lg:grid-cols-12 lg:gap-8">
          <Reveal className="lg:col-span-7" index={0}>
            <PathwayPanel pathway={rn} className="h-full" />
          </Reveal>
          <Reveal className="lg:col-span-5 lg:mt-20" index={1}>
            <PathwayPanel pathway={rm} className="h-full" />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
