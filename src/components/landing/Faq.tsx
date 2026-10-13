import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";
import { FAQ } from "@/lib/landing-content";

/** Questions and answers in two columns, all visible at once: nothing hides behind a click. */
export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 py-16 md:py-28">
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-4">
          <h2 className="text-3xl font-semibold md:text-4xl lg:sticky lg:top-28">{FAQ.title}</h2>
        </Reveal>
        <dl className="grid grid-cols-1 gap-x-10 gap-y-9 md:grid-cols-2 lg:col-span-8">
          {FAQ.items.map((item, index) => (
            <Reveal key={item.question} index={index % 2}>
              <dt className="text-lg font-semibold">{item.question}</dt>
              <dd className="mt-2 text-sm text-muted-foreground md:text-base">{item.answer}</dd>
            </Reveal>
          ))}
        </dl>
      </Container>
    </section>
  );
}
