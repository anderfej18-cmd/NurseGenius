import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Who may open each page, and which screens still talk to the database directly. Both are lists a
// person decided on, so adding a page or a direct call without deciding fails here.

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(`${dir}/${entry.name}`)
      : /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
        ? [`${dir}/${entry.name}`]
        : [],
  );
}

// ---- Page access ----

const routeFiles = files("src/routes").filter((file) => !file.endsWith("__root.tsx"));
const routes = routeFiles.flatMap((file) => {
  const path = /createFileRoute\(\s*"([^"]+)"/.exec(read(file))?.[1];
  return path === undefined ? [] : [{ path, file, source: read(file) }];
});

/** Pages anyone may open, and why. */
const PUBLIC_PAGES: Readonly<Record<string, string>> = {
  "/": "Landing page.",
  "/auth": "Sign in and sign up.",
  "/test/$token":
    "A shared test opens for people who have no account; results can be linked later.",
  "/api/public/paystack-verify":
    "Paystack's check of a payment; it verifies the caller's own token.",
};

describe("who may open each page", () => {
  it("finds the pages", () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it("sends a visitor who is signed out away from every page that is not public", () => {
    for (const route of routes) {
      // The admin page has its own, stricter test below; /progress only redirects.
      if (route.path in PUBLIC_PAGES || route.path === "/progress" || route.path === "/admin")
        continue;
      const guarded =
        route.source.includes("SignedInPage") ||
        /navigate\(\{\s*to:\s*"\/auth"/.test(route.source) ||
        route.source.includes("<Outlet");
      expect(
        guarded,
        `${route.path} (${route.file}) neither uses SignedInPage nor sends visitors to /auth`,
      ).toBe(true);
    }
  });

  it("lists only public pages that exist", () => {
    for (const path of Object.keys(PUBLIC_PAGES)) {
      expect(
        routes.map((route) => route.path),
        `${path} no longer exists`,
      ).toContain(path);
    }
  });

  it("keeps the admin page for admins and builds its tabs from the shared list", () => {
    const admin = routes.find((route) => route.path === "/admin");
    expect(admin).toBeDefined();
    expect(admin?.source).toMatch(/!isAdmin/);
    expect(admin?.source).toContain("adminTabsFor");
    expect(admin?.source).toContain("resolveAdminTab");
    expect(admin?.source).toMatch(/to:\s*"\/dashboard"/);
  });

  it("does not show the admin page's tabs by any other list", () => {
    const admin = routes.find((route) => route.path === "/admin");
    expect(admin?.source).not.toMatch(/<TabsTrigger value="/);
  });

  it("keeps old addresses working by redirecting them", () => {
    const progress = routes.find((route) => route.path === "/progress");
    expect(progress?.source).toMatch(/redirect\(\{\s*to:\s*"\/today"/);
  });
});

// ---- Direct database access from the browser ----

interface DirectAccess {
  tables: readonly string[];
  rpcs: readonly string[];
  why: string;
}

/**
 * Every browser file that calls the database itself (not through a server function), with exactly
 * what it touches. Row-level security and column grants are what protect these calls; they are
 * tested in src/server/testing/direct-browser-access.test.ts. Anything new belongs in a server function.
 */
const DIRECT_ACCESS: Readonly<Record<string, DirectAccess>> = {
  "src/hooks/use-auth.tsx": {
    tables: ["profiles", "user_roles"],
    rpcs: ["check_expire_tier"],
    why: "Loads the signed-in person's own profile and roles, and expires a lapsed plan.",
  },
  "src/routes/onboarding.tsx": {
    tables: ["profiles"],
    rpcs: [],
    why: "Saves the first-run fields; the database grants only those columns.",
  },
  "src/routes/payments.tsx": {
    tables: ["plans", "subscription_payments"],
    rpcs: [],
    why: "Reads the plans and the person's own payments; payment is verified by the server route.",
  },
  "src/routes/admin.tsx": {
    tables: ["exams", "plans", "profiles", "questions", "subscription_payments", "user_roles"],
    rpcs: ["assign_user_tier"],
    why: "Central-admin tabs (Upgrades, Pricing, Users, Assign Admin) and a question count; the database allows these to admins only.",
  },
};

/** Files that import the browser client but make no table or function call of their own. */
const CLIENT_ONLY: Readonly<Record<string, string>> = {
  "src/routes/auth.tsx": "Sign in, sign up and Google sign-in (Supabase Auth).",
  "src/routes/dashboard.tsx":
    "Listens for changes to the person's own profile row to refresh the daily counter.",
  "src/lib/ask-ai.ts": "Calls the ask-ai Edge Function with the signed-in session.",
};

const importsClient = (source: string) => source.includes('integrations/supabase/client"');
const callsOf = (source: string, method: "from" | "rpc") =>
  [...source.matchAll(new RegExp(`\\.${method}\\(\\s*"([a-z_0-9]+)"`, "g"))].map((m) => m[1]);

describe("direct database calls from the browser", () => {
  const browserFiles = ["src/routes", "src/components", "src/hooks", "src/lib"]
    .flatMap(files)
    .filter((file) => !file.endsWith("routeTree.gen.ts"));
  const users = browserFiles.filter((file) => importsClient(read(file)));

  it("happen only in the files listed, and each file calls only what it is listed for", () => {
    const known = new Set([...Object.keys(DIRECT_ACCESS), ...Object.keys(CLIENT_ONLY)]);
    expect(
      users.filter((file) => !known.has(file)),
      "a new file uses the browser client",
    ).toEqual([]);
    for (const [file, allowed] of Object.entries(DIRECT_ACCESS)) {
      const source = read(file);
      expect([...new Set(callsOf(source, "from"))].sort(), `${file} tables`).toEqual(
        [...allowed.tables].sort(),
      );
      expect([...new Set(callsOf(source, "rpc"))].sort(), `${file} functions`).toEqual(
        [...allowed.rpcs].sort(),
      );
    }
  });

  it("makes no table or function call in the files listed as client-only", () => {
    for (const file of Object.keys(CLIENT_ONLY)) {
      const source = read(file);
      expect(callsOf(source, "from"), `${file} tables`).toEqual([]);
      expect(callsOf(source, "rpc"), `${file} functions`).toEqual([]);
    }
  });

  it("lists only files that still use the client", () => {
    for (const file of [...Object.keys(DIRECT_ACCESS), ...Object.keys(CLIENT_ONLY)]) {
      expect(importsClient(read(file)), `${file} no longer imports the client`).toBe(true);
    }
  });

  it("gives every direct use a reason", () => {
    for (const [file, access] of Object.entries(DIRECT_ACCESS)) {
      expect(access.why.length, file).toBeGreaterThan(20);
    }
  });
});
