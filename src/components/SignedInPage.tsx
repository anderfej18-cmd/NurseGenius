import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  title: string;
  description?: string;
  children: (userId: string) => ReactNode;
}

/**
 * The body of a signed-in page: its title, then the content once the account has loaded. The frame
 * around it (navigation, sign-in and onboarding redirects) is the `_app` layout's job, so a page
 * cannot forget it.
 */
export function SignedInPage({ title, description, children }: Props) {
  const { user, profile } = useAuth();
  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={title} description={description} />
      <div className="flex flex-col gap-4">
        {user && profile ? (
          children(user.id)
        ) : (
          <div aria-busy="true" className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
