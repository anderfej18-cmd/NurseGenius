import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_DEFAULT_TAB,
  ADMIN_TABS,
  NAV_NOT_LISTED,
  activeGroupId,
  adminTabsFor,
  isNavItemActive,
  menuItemsOf,
  navigationFor,
  toolbarItemsOf,
  resolveAdminTab,
  type NavViewer,
} from "./navigation";

const viewer = (overrides: Partial<NavViewer> = {}): NavViewer => ({
  signedIn: true,
  onboarded: true,
  isAdmin: false,
  isCentralAdmin: false,
  ...overrides,
});
const student = viewer();
const admin = viewer({ isAdmin: true });
const central = viewer({ isAdmin: true, isCentralAdmin: true });

const itemsOf = (v: NavViewer) => navigationFor(v).flatMap((group) => group.items);
const destination = (item: { to: string; search?: { tab: string } }) =>
  item.search ? `${item.to}?tab=${item.search.tab}` : item.to;

// ---- Which routes exist: read from the route files, the source of truth for the router ----
const ROUTES_DIR = join(process.cwd(), "src/routes");
function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? routeFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}
const routePaths = routeFiles(ROUTES_DIR)
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith("__root.tsx"))
  .flatMap((file) => {
    const match = /createFileRoute\(\s*"([^"]+)"/.exec(readFileSync(file, "utf8"));
    return match ? [match[1]] : [];
  });

describe("who sees which navigation", () => {
  it("shows nothing to a visitor who is signed out or has not finished onboarding", () => {
    expect(navigationFor(viewer({ signedIn: false, onboarded: false }))).toEqual([]);
    expect(navigationFor(viewer({ onboarded: false }))).toEqual([]);
  });

  it("gives a student every student group and none of the admin ones", () => {
    const groups = navigationFor(student);
    expect(groups.map((group) => group.id)).toEqual([
      "learn",
      "review",
      "insights",
      "community",
      "account",
    ]);
    expect(itemsOf(student).some((item) => item.to === "/admin")).toBe(false);
  });

  it("gives an admin the student groups and an admin group", () => {
    const groups = navigationFor(admin);
    expect(groups.at(-1)?.id).toBe("admin");
    expect(groups.slice(0, -1).map((group) => group.id)).toEqual(
      navigationFor(student).map((group) => group.id),
    );
  });

  it("lets an admin who has not finished onboarding reach the admin tools only", () => {
    const groups = navigationFor(viewer({ isAdmin: true, onboarded: false }));
    expect(groups.map((group) => group.id)).toEqual(["admin"]);
  });

  it("keeps the central-admin tabs away from an ordinary admin, and the sub-admin user list away from a central admin", () => {
    const adminTabs = itemsOf(admin).flatMap((item) => (item.search ? [item.search.tab] : []));
    const centralTabs = itemsOf(central).flatMap((item) => (item.search ? [item.search.tab] : []));
    for (const hidden of ["payments", "pricing", "users", "admin-access"]) {
      expect(adminTabs).not.toContain(hidden);
      expect(centralTabs).toContain(hidden);
    }
    expect(adminTabs).toContain("sub-users");
    expect(centralTabs).not.toContain("sub-users");
  });

  it("offers every admin tab exactly once to the people allowed to use it", () => {
    const offered = (v: NavViewer) => adminTabsFor(v).map((tab) => tab.id);
    expect(offered(student)).toEqual([]);
    expect(new Set(offered(central)).size).toBe(offered(central).length);
    expect(offered(admin)).toEqual(expect.arrayContaining(["questions", "bank", "reports"]));
  });
});

describe("every button is real and distinct", () => {
  const everyone = [student, admin, central];

  it("never lists two buttons for one destination or two with the same label", () => {
    for (const v of everyone) {
      const items = itemsOf(v);
      expect(new Set(items.map(destination)).size, "duplicate destination").toBe(items.length);
      expect(new Set(items.map((item) => item.label)).size, "duplicate label").toBe(items.length);
    }
  });

  it("points every button at a page that exists", () => {
    for (const v of everyone) {
      for (const item of itemsOf(v)) {
        expect(routePaths, `${item.label} -> ${item.to}`).toContain(item.to);
      }
    }
  });

  it("describes every button in plain words", () => {
    for (const item of itemsOf(central)) {
      expect(item.label.trim().length, item.id).toBeGreaterThan(2);
      expect(item.label.length, `${item.id} label is too long for a button`).toBeLessThanOrEqual(
        24,
      );
      expect(item.description.trim().length, item.id).toBeGreaterThan(10);
    }
  });

  it("gives no group an empty list", () => {
    for (const v of everyone) {
      for (const group of navigationFor(v)) expect(group.items.length, group.id).toBeGreaterThan(0);
    }
  });

  it("has an entry for every page a student can open by itself", () => {
    const reachable = new Set<string>(itemsOf(central).map((item) => item.to));
    const standalone = routePaths.filter(
      (path) =>
        !path.includes("$") && !path.startsWith("/api/") && path !== "/" && path !== "/auth",
    );
    for (const path of standalone) {
      const reason = (NAV_NOT_LISTED as Record<string, string | undefined>)[path];
      expect(
        reachable.has(path) || reason !== undefined,
        `${path} has no navigation button and is not listed in NAV_NOT_LISTED`,
      ).toBe(true);
    }
  });

  it("lists in NAV_NOT_LISTED only pages that exist and really have no button", () => {
    const reachable = new Set<string>(itemsOf(central).map((item) => item.to));
    for (const path of Object.keys(NAV_NOT_LISTED)) {
      expect(routePaths, `${path} no longer exists`).toContain(path);
      expect(reachable.has(path), `${path} has a button now: remove it from the list`).toBe(false);
    }
  });
});

describe("the active button", () => {
  const find = (id: string) => {
    const item = itemsOf(central).find((candidate) => candidate.id === id);
    if (!item) throw new Error(`no ${id}`);
    return item;
  };

  it("marks a page by its path", () => {
    expect(isNavItemActive(find("dashboard"), { pathname: "/dashboard" })).toBe(true);
    expect(isNavItemActive(find("dashboard"), { pathname: "/bookmarks" })).toBe(false);
  });

  it("keeps Take a Test lit while a test is being taken, and Test History lit on its results", () => {
    expect(isNavItemActive(find("start-test"), { pathname: "/exam/start" })).toBe(true);
    expect(isNavItemActive(find("start-test"), { pathname: "/exam/abc-123" })).toBe(true);
    expect(isNavItemActive(find("start-test"), { pathname: "/exam/abc-123/results" })).toBe(false);
    expect(isNavItemActive(find("history"), { pathname: "/exam/abc-123/results" })).toBe(true);
  });

  it("tells the admin tabs apart by the tab in the address, with Add Questions as the default", () => {
    expect(
      isNavItemActive(find("admin-bank"), { pathname: "/admin", search: { tab: "bank" } }),
    ).toBe(true);
    expect(
      isNavItemActive(find("admin-reports"), { pathname: "/admin", search: { tab: "bank" } }),
    ).toBe(false);
    expect(isNavItemActive(find("admin-questions"), { pathname: "/admin", search: {} })).toBe(true);
    expect(isNavItemActive(find("admin-bank"), { pathname: "/admin", search: {} })).toBe(false);
  });

  it("names the group that holds the active button", () => {
    const groups = navigationFor(central);
    expect(activeGroupId(groups, { pathname: "/mistakes" })).toBe("review");
    expect(activeGroupId(groups, { pathname: "/admin", search: { tab: "pricing" } })).toBe("admin");
    expect(activeGroupId(groups, { pathname: "/" })).toBeNull();
  });
});

describe("resolveAdminTab", () => {
  it("opens the requested tab when this admin may use it", () => {
    expect(resolveAdminTab("reports", admin)).toBe("reports");
    expect(resolveAdminTab("pricing", central)).toBe("pricing");
  });

  it("falls back to the default tab for an unknown tab, a missing one, or one this admin may not use", () => {
    expect(resolveAdminTab("nonsense", admin)).toBe(ADMIN_DEFAULT_TAB);
    expect(resolveAdminTab(undefined, admin)).toBe(ADMIN_DEFAULT_TAB);
    expect(resolveAdminTab("pricing", admin)).toBe(ADMIN_DEFAULT_TAB);
    expect(resolveAdminTab("sub-users", central)).toBe(ADMIN_DEFAULT_TAB);
  });

  it("has a default that every admin may use", () => {
    expect(adminTabsFor(admin).map((tab) => tab.id)).toContain(ADMIN_DEFAULT_TAB);
    expect(ADMIN_TABS.length).toBeGreaterThan(8);
  });
});

describe("the toolbar button", () => {
  it("keeps Notifications as an icon in the header, so it has one button and not two", () => {
    const groups = navigationFor(student);
    expect(toolbarItemsOf(groups).map((item) => item.id)).toEqual(["notifications"]);
    const inMenus = groups.flatMap(menuItemsOf).map((item) => item.id);
    expect(inMenus).not.toContain("notifications");
  });

  it("puts every other button in a menu", () => {
    const groups = navigationFor(central);
    const all = groups.flatMap((group) => group.items).length;
    expect(groups.flatMap(menuItemsOf).length + toolbarItemsOf(groups).length).toBe(all);
  });

  it("shows no toolbar button to a visitor with no navigation", () => {
    expect(toolbarItemsOf(navigationFor(viewer({ signedIn: false })))).toEqual([]);
  });
});
