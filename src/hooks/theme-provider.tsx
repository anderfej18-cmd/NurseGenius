import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ThemeContext } from "@/hooks/theme-context";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  parseThemePreference,
  themeFor,
  type ThemePreference,
} from "@/lib/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * A theme change recolours nearly every element at once; with their transitions running it smears
 * instead of snapping. Switch transitions off for the swap, force a reflow, and restore them on the
 * next frame.
 */
function swapWithoutTransitions(change: () => void) {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none !important}";
  document.head.appendChild(style);
  change();
  void getComputedStyle(document.body).opacity;
  requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
}

const readStoredPreference = (): ThemePreference => {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Storage can be blocked (private windows, site data off); the default still works.
    return DEFAULT_THEME_PREFERENCE;
  }
};

/**
 * Keeps the class on <html> in step with the person's choice, the system setting and the address.
 * The first paint is handled by `themeInitScript`; this takes over after hydration, so it starts from
 * the same default the server rendered and reads storage in an effect.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [systemDark, setSystemDark] = useState(false);
  // False until storage and the system setting have been read. Until then the class the inline script
  // already put on <html> is left alone, so hydration cannot flash the wrong theme.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPreferenceState(readStoredPreference());
    const query = window.matchMedia(DARK_QUERY);
    setSystemDark(query.matches);
    setReady(true);
    const onSystemChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    // Another tab changing the choice reaches this tab too.
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setPreferenceState(readStoredPreference());
    };
    query.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      query.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const appliedTheme = themeFor(pathname, preference, systemDark);

  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.classList.toggle("dark", appliedTheme === "dark");
    root.setAttribute("data-theme", appliedTheme);
  }, [appliedTheme, ready]);

  const setPreference = useCallback((next: ThemePreference) => {
    swapWithoutTransitions(() => setPreferenceState(next));
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit; it just will not be remembered.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, appliedTheme, setPreference }),
    [preference, appliedTheme, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
