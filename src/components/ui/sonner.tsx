import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/hooks/theme-context";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Toasts follow the applied theme, so a toast never appears light on a dark page.
const Toaster = ({ ...props }: ToasterProps) => {
  const { appliedTheme } = useTheme();
  return (
    <Sonner
      theme={appliedTheme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
