// The one list of navigation buttons. The header builds its menus from it and the admin page builds
// its tabs from it, so a button, its page and its permission cannot drift apart (a test checks that
// every button leads to a page that exists, and every standalone page has a button).
// Pure data and functions: no React, no router, importable anywhere.

export type NavGroupId = "learn" | "review" | "insights" | "community" | "account" | "admin";

/** Who is looking: only what decides which buttons are shown. The server still checks every action. */
export interface NavViewer {
  signedIn: boolean;
  onboarded: boolean;
  isAdmin: boolean;
  isCentralAdmin: boolean;
}

export type StudentPath =
  | "/dashboard"
  | "/today"
  | "/exam/start"
  | "/topics"
  | "/plan"
  | "/history"
  | "/mistakes"
  | "/bookmarks"
  | "/mastery"
  | "/analysis"
  | "/achievements"
  | "/friends"
  | "/leaderboard"
  | "/notifications"
  | "/profile"
  | "/payments";

// ---- Admin tabs ----

/** Who may open an admin tab: any admin, the central admin only, or an admin who is not the central one. */
export type AdminTabAccess = "admin" | "central_admin" | "sub_admin";

interface AdminTabDefinition {
  id: string;
  label: string;
  description: string;
  access: AdminTabAccess;
}

export const ADMIN_TABS = [
  {
    id: "questions",
    label: "Add Questions",
    description: "Add questions one at a time or import a batch.",
    access: "admin",
  },
  {
    id: "bank",
    label: "Question Bank",
    description: "Search, edit, retire and restore questions, and manage subtopics.",
    access: "admin",
  },
  {
    id: "reports",
    label: "Question Reports",
    description: "Read what students reported about questions and resolve each report.",
    access: "admin",
  },
  {
    id: "custom-tests",
    label: "Create Live Test",
    description: "Schedule a timed test from the bank or your own file and share its link.",
    access: "admin",
  },
  {
    id: "audit",
    label: "Audit & Fix Questions",
    description: "Find incomplete or malformed questions, then edit, retire or delete them.",
    access: "admin",
  },
  {
    id: "leaderboards",
    label: "Leaderboards",
    description: "See the daily and weekly rankings.",
    access: "admin",
  },
  {
    id: "payments",
    label: "Upgrades",
    description: "See every plan payment.",
    access: "central_admin",
  },
  {
    id: "pricing",
    label: "Pricing & Duration",
    description: "Change what each plan costs and how long it lasts.",
    access: "central_admin",
  },
  {
    id: "users",
    label: "Users",
    description: "Find students and change their plan.",
    access: "central_admin",
  },
  {
    id: "admin-access",
    label: "Assign Admin",
    description: "Give or take away admin access.",
    access: "central_admin",
  },
  {
    id: "sub-users",
    label: "Users",
    description: "Find students and see how they are doing.",
    access: "sub_admin",
  },
] as const satisfies readonly AdminTabDefinition[];

export type AdminTab = (typeof ADMIN_TABS)[number];
export type AdminTabId = AdminTab["id"];
export const ADMIN_DEFAULT_TAB: AdminTabId = "questions";

const mayOpen = (access: AdminTabAccess, viewer: NavViewer): boolean => {
  if (!viewer.signedIn || !viewer.isAdmin) return false;
  if (access === "admin") return true;
  return access === "central_admin" ? viewer.isCentralAdmin : !viewer.isCentralAdmin;
};

/** The admin tabs this viewer may open, in display order. */
export function adminTabsFor(viewer: NavViewer): AdminTab[] {
  return ADMIN_TABS.filter((tab) => mayOpen(tab.access, viewer));
}

/** The tab to show for the address's `tab` value: the requested one if allowed, else the default. */
export function resolveAdminTab(requested: unknown, viewer: NavViewer): AdminTabId {
  const match = adminTabsFor(viewer).find((tab) => tab.id === requested);
  return match ? match.id : ADMIN_DEFAULT_TAB;
}

// ---- Buttons ----

export interface NavItem {
  id: string;
  label: string;
  description: string;
  to: StudentPath | "/admin";
  /** Shown as an icon in the top bar (it carries a live count) instead of in the menus. */
  toolbar?: true;
  /** One of the four buttons kept in the phone's bottom bar (everything else is under "More"). */
  primary?: true;
  /** A shorter label for the bottom bar, where each button has about 80px. */
  shortLabel?: string;
  /** Only the admin page takes this: which tab to open. */
  search?: { tab: AdminTabId };
  /** Extra address patterns on which this button is lit (a test in progress, a results page). */
  alsoActiveOn?: readonly RegExp[];
  /** Address patterns on which it is not lit although the path starts the same. */
  notActiveOn?: readonly RegExp[];
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  items: NavItem[];
}

const STUDENT_GROUPS: ReadonlyArray<{
  id: Exclude<NavGroupId, "admin">;
  label: string;
  items: NavItem[];
}> = [
  {
    id: "learn",
    label: "Learn",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        description: "Your plan, daily allowance, average score and recent tests.",
        to: "/dashboard",
        primary: true,
      },
      {
        id: "today",
        label: "Study Today",
        description: "What to study today, why, and your streak and daily challenge.",
        to: "/today",
        primary: true,
      },
      {
        id: "start-test",
        label: "Take a Test",
        description: "Start a practice test: random, adaptive, mistakes or revision.",
        to: "/exam/start",
        primary: true,
        alsoActiveOn: [/^\/exam\/[^/]+$/],
        notActiveOn: [/^\/exam\/[^/]+\/results$/],
      },
      {
        id: "topics",
        label: "Topics",
        description: "Every topic and how many questions it has, with a button to practise it.",
        to: "/topics",
      },
      {
        id: "plan",
        label: "Study Plan",
        description: "Your week-by-week plan to your exam date.",
        to: "/plan",
      },
    ],
  },
  {
    id: "review",
    label: "Review",
    items: [
      {
        id: "history",
        label: "Test History",
        description: "Your finished tests and their results, rationales and AI help.",
        to: "/history",
        alsoActiveOn: [/^\/exam\/[^/]+\/results$/],
      },
      {
        id: "mistakes",
        label: "Mistake Bank",
        description: "Questions you got wrong, with similar questions to practise.",
        to: "/mistakes",
      },
      {
        id: "bookmarks",
        label: "Bookmarks",
        description: "Questions you saved to come back to.",
        to: "/bookmarks",
      },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      {
        id: "mastery",
        label: "Mastery & Readiness",
        description: "How well you know each topic and your exam-readiness estimate.",
        to: "/mastery",
        primary: true,
        shortLabel: "Mastery",
      },
      {
        id: "analysis",
        label: "Performance Analysis",
        description: "Trends, repeated mistakes, pace and confidence, explained.",
        to: "/analysis",
      },
      {
        id: "achievements",
        label: "Achievements",
        description: "Your level, XP and the achievements you have earned.",
        to: "/achievements",
      },
    ],
  },
  {
    id: "community",
    label: "Community",
    items: [
      {
        id: "friends",
        label: "Friends & Challenges",
        description: "Add friends and challenge them to a test.",
        to: "/friends",
      },
      {
        id: "leaderboard",
        label: "Leaderboard",
        description: "Today's rankings.",
        to: "/leaderboard",
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      {
        id: "notifications",
        label: "Notifications",
        description: "Friend requests and challenges sent to you.",
        to: "/notifications",
        toolbar: true,
      },
      {
        id: "profile",
        label: "Profile",
        description: "Your details, exam date and plan.",
        to: "/profile",
      },
      {
        id: "upgrade",
        label: "Upgrade",
        description: "Choose a plan and see your payments.",
        to: "/payments",
      },
    ],
  },
];

/**
 * Pages that are real but deliberately have no navigation button, with the reason. A test checks that
 * each exists and has no button, so this list cannot hide a missing entry point.
 */
export const NAV_NOT_LISTED: Readonly<Record<string, string>> = {
  "/onboarding": "First-run profile setup; shown automatically until it is finished.",
  "/progress": "Old address. It redirects to Study Today so saved links keep working.",
};

const adminGroup = (viewer: NavViewer): NavGroup | null => {
  const tabs = adminTabsFor(viewer);
  if (tabs.length === 0) return null;
  return {
    id: "admin",
    label: "Admin",
    items: tabs.map((tab) => ({
      id: `admin-${tab.id}`,
      label: tab.label,
      description: tab.description,
      to: "/admin",
      search: { tab: tab.id },
    })),
  };
};

/** The groups of buttons this viewer sees, in display order. Empty until the viewer can use them. */
export function navigationFor(viewer: NavViewer): NavGroup[] {
  if (!viewer.signedIn) return [];
  const student: NavGroup[] = viewer.onboarded
    ? STUDENT_GROUPS.map((group) => ({ ...group, items: [...group.items] }))
    : [];
  const admin = adminGroup(viewer);
  return admin ? [...student, admin] : student;
}

// ---- The active button ----

export interface NavLocation {
  pathname: string;
  search?: { tab?: unknown };
}

export function isNavItemActive(item: NavItem, location: NavLocation): boolean {
  if (item.notActiveOn?.some((pattern) => pattern.test(location.pathname))) return false;
  if (item.to === "/admin") {
    if (location.pathname !== "/admin") return false;
    const requested = location.search?.tab;
    const tab = typeof requested === "string" ? requested : ADMIN_DEFAULT_TAB;
    return item.search?.tab === tab;
  }
  if (location.pathname === item.to) return true;
  return item.alsoActiveOn?.some((pattern) => pattern.test(location.pathname)) ?? false;
}

/** The button that is lit at this address, or null when none is (an unknown or unlisted page). */
export function activeNavItem(groups: readonly NavGroup[], location: NavLocation): NavItem | null {
  for (const group of groups) {
    const item = group.items.find((candidate) => isNavItemActive(candidate, location));
    if (item) return item;
  }
  return null;
}

/** The group that holds the lit button, for highlighting the menu that contains it. */
export function activeGroupId(
  groups: readonly NavGroup[],
  location: NavLocation,
): NavGroupId | null {
  return (
    groups.find((group) => group.items.some((item) => isNavItemActive(item, location)))?.id ?? null
  );
}

/** The buttons of a group that belong in a menu. */
export const menuItemsOf = (group: NavGroup): NavItem[] =>
  group.items.filter((item) => item.toolbar !== true);

/** The buttons that sit in the header itself. */
export const toolbarItemsOf = (groups: readonly NavGroup[]): NavItem[] =>
  groups.flatMap((group) => group.items.filter((item) => item.toolbar === true));

/** The buttons kept in the phone's bottom bar, in display order. */
export const bottomBarItemsOf = (groups: readonly NavGroup[]): NavItem[] =>
  groups.flatMap((group) => group.items.filter((item) => item.primary === true));
