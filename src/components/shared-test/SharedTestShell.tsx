import type { ReactNode } from "react";
import { PublicHeader } from "@/components/PublicHeader";

/** The frame of every state of a public test page: always the light theme, the public header, one main. */
export function SharedTestShell({
  children,
  width = "max-w-3xl",
}: {
  children: ReactNode;
  width?: string;
}) {
  return (
    <div className="theme-fixed min-h-dvh bg-background text-foreground">
      <PublicHeader />
      <main id="main" className={`mx-auto w-full ${width} gutter py-8 md:py-12`}>
        {children}
      </main>
    </div>
  );
}
