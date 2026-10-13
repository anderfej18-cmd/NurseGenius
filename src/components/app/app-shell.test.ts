import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ICONS } from "@/components/app/nav-icons";
import { ADMIN_TABS, navigationFor } from "@/lib/navigation";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("the application shell", () => {
  const everyone = navigationFor({
    signedIn: true,
    onboarded: true,
    isAdmin: true,
    isCentralAdmin: true,
  });
  const subAdmin = navigationFor({
    signedIn: true,
    onboarded: true,
    isAdmin: true,
    isCentralAdmin: false,
  });
  const ids = [...everyone, ...subAdmin].flatMap((group) => group.items.map((item) => item.id));

  it("has an icon for every button the navigation can show", () => {
    for (const id of new Set(ids)) expect(NAV_ICONS[id], id).toBeDefined();
  });

  it("has no icon for a button that does not exist", () => {
    const known = new Set([...ids, ...ADMIN_TABS.map((tab) => `admin-${tab.id}`)]);
    for (const id of Object.keys(NAV_ICONS)) expect(known.has(id), id).toBe(true);
  });

  it("offers a skip link, one main landmark and labelled navigation regions", () => {
    const shell = read("src/components/app/AppShell.tsx");
    expect(shell).toContain('href="#main"');
    expect(shell.match(/<main\b/g)).toHaveLength(1);
    expect(shell).toContain("pb-24");
    const sidebar = read("src/components/app/SidebarNav.tsx");
    expect(sidebar).toContain("aria-label={label}");
    expect(sidebar).toContain('role="group"');
    expect(read("src/components/app/BottomBar.tsx")).toContain("safe-bottom");
  });

  it("puts the theme control inside the application, never on public pages", () => {
    expect(read("src/components/app/AccountMenu.tsx")).toContain("ThemeControl");
    for (const file of [
      "src/routes/index.tsx",
      "src/routes/auth.tsx",
      "src/routes/onboarding.tsx",
      "src/components/StatusPages.tsx",
      "src/components/PublicHeader.tsx",
    ]) {
      expect(read(file), file).not.toContain("ThemeControl");
    }
  });

  it("leaves no page with a header or landmark of its own under the layout", () => {
    const pages = ["dashboard", "payments", "admin", "leaderboard", "exam.start"];
    for (const page of pages) {
      const source = read(`src/routes/_app/${page}.tsx`);
      expect(source, page).not.toMatch(/AppHeader|<main\b/);
    }
  });
});
