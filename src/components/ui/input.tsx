import * as React from "react";

import { cn } from "@/lib/utils";

// A field is a well: slightly darker than the surface it sits on, with a 3:1 edge (the `input`
// token) so its boundary is visible to everyone. 16px on a phone so iOS does not zoom, 14px above.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-sunken px-3 py-2 text-base text-foreground transition-[border-color,box-shadow] duration-150 ease-out file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm pointer-coarse:min-h-11",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
