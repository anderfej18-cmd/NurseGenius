import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { NotFoundPage, RouteErrorPage } from "@/components/StatusPages";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/theme-provider";
import { themeInitScript } from "@/lib/theme";
import appCss from "../styles.css?url";

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  return (
    <RouteErrorPage
      message={error instanceof Error ? error.message : "Something unexpected happened."}
      onRetry={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "NurseGenius — CBT Prep & AI Mentor for Nursing Exams" },
      {
        name: "description",
        content:
          "Practice RN & RM CBT exams, track progress, and get AI-powered explanations. Built for nursing students.",
      },
      { property: "og:title", content: "NurseGenius — CBT Prep & AI Mentor for Nursing Exams" },
      {
        property: "og:description",
        content:
          "Practice RN & RM CBT exams, track progress, and get AI-powered explanations. Built for nursing students.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "NurseGenius — CBT Prep & AI Mentor for Nursing Exams" },
      {
        name: "twitter:description",
        content:
          "Practice RN & RM CBT exams, track progress, and get AI-powered explanations. Built for nursing students.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/f0284180-01a3-4776-8225-233ec83e16b3",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/f0284180-01a3-4776-8225-233ec83e16b3",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // The two faces above the fold load before the stylesheet asks for them.
      {
        rel: "preload",
        href: "/fonts/bricolage-grotesque-latin-wght.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/geist-latin-wght.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    // The class on <html> is set by the script below before first paint, so React must not treat the
    // difference from the server's markup as an error.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Outlet />
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
