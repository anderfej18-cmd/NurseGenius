import { createContext, useContext } from "react";
import type { AppliedTheme, ThemePreference } from "@/lib/theme";

export interface ThemeContextValue {
  /** What the person chose: Light, Dark or System. */
  preference: ThemePreference;
  /** What is showing at this address (public pages are always light). */
  appliedTheme: AppliedTheme;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
