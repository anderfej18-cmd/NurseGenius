// Light / dark / system theming, as pure functions. The React provider (hooks/theme-provider.tsx) and the
// inline script that runs before first paint (`themeInitScript`) both follow the rules here, and a
// test runs the script against `themeFor` over every combination so the two cannot disagree.
//
// Rules:
//  - The signed-in application (student and admin) honours the person's choice: Light, Dark or System.
//  - Public pages (landing, sign in, onboarding, shared tests, the 404 page) are always light, so a
//    visitor's dashboard preference can never change the first impression.
//  - Nothing about the theme touches data or behaviour; it is a class on <html>.

export type ThemePreference = "light" | "dark" | "system";
export type AppliedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "ng.theme";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

/**
 * Address prefixes of the signed-in application. A path is themed when it equals a prefix or sits
 * under it. Everything else (`/`, `/auth`, `/onboarding`, `/test/...`, unknown addresses) is public.
 */
export const THEMED_PATH_PREFIXES = [
  "/dashboard",
  "/today",
  "/exam",
  "/topics",
  "/plan",
  "/history",
  "/mistakes",
  "/bookmarks",
  "/mastery",
  "/analysis",
  "/achievements",
  "/friends",
  "/leaderboard",
  "/notifications",
  "/profile",
  "/payments",
  "/admin",
] as const;

/** Read a stored value defensively: anything unexpected becomes the default. */
export function parseThemePreference(raw: unknown): ThemePreference {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : DEFAULT_THEME_PREFERENCE;
}

/** What a preference means right now, given whether the system asks for dark. */
export function resolvePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): AppliedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/** True when the address belongs to the signed-in application. */
export function isThemedPath(pathname: string): boolean {
  return THEMED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** The theme to show at an address: the person's choice inside the app, light everywhere else. */
export function themeFor(
  pathname: string,
  preference: ThemePreference,
  systemPrefersDark: boolean,
): AppliedTheme {
  return isThemedPath(pathname) ? resolvePreference(preference, systemPrefersDark) : "light";
}

/**
 * The script placed in <head> so the right class is on <html> before the first paint (no flash of the
 * wrong theme). It only reads storage and the media query, and it never throws: a blocked
 * localStorage falls back to the default preference.
 */
export function themeInitScript(): string {
  const prefixes = JSON.stringify(THEMED_PATH_PREFIXES);
  return `(function(){try{var p=${prefixes},k=${JSON.stringify(THEME_STORAGE_KEY)},path=location.pathname,themed=false;for(var i=0;i<p.length;i++){if(path===p[i]||path.indexOf(p[i]+"/")===0){themed=true;break}}var s="system";try{var v=localStorage.getItem(k);if(v==="light"||v==="dark"||v==="system")s=v}catch(e){}var d=s==="dark"||(s==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var dark=themed&&d;var r=document.documentElement;r.classList.toggle("dark",dark);r.setAttribute("data-theme",dark?"dark":"light")}catch(e){}})();`;
}
