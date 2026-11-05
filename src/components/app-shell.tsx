"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { cn, Kbd } from "./ui";
import {
  IconActivity, IconBell, IconCalendar, IconCamera, IconChart, IconFile, IconFlag,
  IconHandshake, IconHistory, IconHome, IconList, IconMenu, IconPlus, IconReceipt,
  IconRepeat, IconRotate, IconScale, IconSearch, IconSettings, IconSparkle, IconStore,
  IconTag, IconTarget, IconTrendDown, IconUpload, IconUsers, IconWallet, IconZap,
} from "./icons";

/**
 * Navigation.
 *
 * Mobile and desktop are different information architectures, not one layout at
 * two widths. Phones get five thumb-reachable destinations with the add action
 * in the centre; desktop gets the full grouped rail and ⌘K. The "More" sheet on
 * mobile holds everything the tab bar cannot.
 */

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ href: string; label: string; Icon: typeof IconHome; badgeKey?: string }>;
}> = [
  {
    label: "Money",
    items: [
      { href: "/", label: "Overview", Icon: IconHome },
      { href: "/transactions", label: "Transactions", Icon: IconList },
      { href: "/accounts", label: "Accounts", Icon: IconWallet },
      { href: "/calendar", label: "Calendar", Icon: IconCalendar },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/budgets", label: "Budgets", Icon: IconTarget },
      { href: "/goals", label: "Goals", Icon: IconFlag },
      { href: "/targets", label: "Targets", Icon: IconZap },
      { href: "/bills", label: "Bills", Icon: IconReceipt, badgeKey: "billsDue" },
      { href: "/subscriptions", label: "Subscriptions", Icon: IconRepeat },
      { href: "/recurring", label: "Recurring", Icon: IconRotate },
      { href: "/debts", label: "Debt", Icon: IconTrendDown },
      { href: "/lending", label: "Lending", Icon: IconHandshake },
    ],
  },
  {
    label: "Understand",
    items: [
      { href: "/analytics", label: "Analytics", Icon: IconChart },
      { href: "/reports", label: "Reports", Icon: IconFile },
      { href: "/assistant", label: "Assistant", Icon: IconSparkle },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/categories", label: "Categories", Icon: IconTag },
      { href: "/merchants", label: "Merchants", Icon: IconStore },
      { href: "/receipts", label: "Receipts", Icon: IconCamera },
      { href: "/import", label: "Import", Icon: IconUpload },
      { href: "/reconcile", label: "Reconcile", Icon: IconScale },
      { href: "/rules", label: "Rules", Icon: IconZap },
      { href: "/household", label: "Household", Icon: IconUsers },
      { href: "/notifications", label: "Notifications", Icon: IconBell, badgeKey: "unread" },
      { href: "/activity", label: "Activity log", Icon: IconHistory },
      { href: "/settings", label: "Settings", Icon: IconSettings },
    ],
  },
];

export interface ShellBadges {
  unread?: number;
  billsDue?: number;
  budgetsOver?: number;
}

export interface ShellUser {
  name: string;
  email: string;
  initials: string;
  householdRole: string | null;
  isAdmin: boolean;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* ------------------------------------------------------------------ rail */

export function Rail({ user, badges }: { user: ShellUser; badges: ShellBadges }) {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col overflow-y-auto border-r border-rule bg-sunken/45 px-3 py-4 lg:flex"
      aria-label="Primary"
    >
      <Link href="/" className="flex items-center gap-2.5 px-2 pt-2 pb-5">
        <span className="grid size-[26px] place-items-center rounded-[7px] bg-ink font-mono text-[13px] font-semibold text-brass-bright">
          S
        </span>
        <span className="font-serif text-[19px] tracking-[-0.015em]">SpendTrack</span>
      </Link>

      <CommandTrigger />

      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-5">
          <div className="eyebrow px-2 pb-2">{group.label}</div>
          {group.items.map(({ href, label, Icon, badgeKey }) => {
            const active = isActive(pathname, href);
            const badge = badgeKey ? badges[badgeKey as keyof ShellBadges] : undefined;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors duration-150",
                  active
                    ? "bg-surface font-medium text-ink shadow-raised"
                    : "text-ink-secondary hover:bg-rule-faint hover:text-ink",
                )}
              >
                {active ? (
                  <span className="absolute inset-y-1.5 -left-3 w-0.5 rounded-r-sm bg-brass" aria-hidden />
                ) : null}
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{label}</span>
                {badge ? (
                  <span className="num ml-auto text-2xs text-ink-tertiary">{badge}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto border-t border-rule pt-4">
        {user.isAdmin ? (
          <Link
            href="/admin"
            className="mb-2 flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-ink-secondary hover:bg-rule-faint hover:text-ink"
          >
            <IconActivity size={16} />
            Platform admin
          </Link>
        ) : null}
        <Link href="/settings" className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 hover:bg-rule-faint">
          <span className="grid size-[22px] shrink-0 place-items-center rounded-sm bg-brass-wash font-mono text-[10px] font-semibold text-brass-deep">
            {user.initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm">{user.name}</span>
            <span className="block truncate text-2xs text-ink-tertiary">
              {user.householdRole ? `Household · ${titleCase(user.householdRole)}` : user.email}
            </span>
          </span>
        </Link>
      </div>
    </nav>
  );
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/* -------------------------------------------------------------- tab bar */

const TABS = [
  { href: "/", label: "Home", Icon: IconHome },
  { href: "/transactions", label: "Activity", Icon: IconList },
  { href: "__add", label: "Add", Icon: IconPlus },
  { href: "/budgets", label: "Budgets", Icon: IconTarget },
  { href: "__more", label: "More", Icon: IconMenu },
] as const;

export function TabBar({
  onAdd,
  onMore,
}: {
  onAdd: () => void;
  onMore: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 grid h-tabbar grid-cols-5 border-t border-rule bg-paper/88 pb-safe backdrop-blur-xl backdrop-saturate-150 lg:hidden"
      aria-label="Primary"
    >
      {TABS.map(({ href, label, Icon }) => {
        if (href === "__add") {
          return (
            <button
              key={href}
              type="button"
              onClick={onAdd}
              aria-label="Add a transaction"
              className="flex items-center justify-center [-webkit-tap-highlight-color:transparent]"
            >
              <span className="-mt-3.5 grid size-[46px] place-items-center rounded-lg bg-ink text-ink-inverse shadow-[0_6px_18px_-6px_rgba(23,22,20,0.45)] transition-transform active:scale-90">
                <IconPlus size={21} />
              </span>
            </button>
          );
        }
        if (href === "__more") {
          return (
            <button
              key={href}
              type="button"
              onClick={onMore}
              className="flex flex-col items-center justify-center gap-[3px] text-2xs font-medium text-ink-tertiary transition-transform active:scale-95 [-webkit-tap-highlight-color:transparent]"
            >
              <Icon size={21} />
              {label}
            </button>
          );
        }

        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-col items-center justify-center gap-[3px] text-2xs font-medium transition-colors active:scale-95",
              active ? "text-ink" : "text-ink-tertiary",
              "[-webkit-tap-highlight-color:transparent]",
            )}
          >
            {active ? (
              <span className="absolute top-0 left-1/2 h-0.5 w-[22px] -translate-x-1/2 rounded-b-sm bg-brass" aria-hidden />
            ) : null}
            <Icon size={21} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/* --------------------------------------------------------------- app bar */

export function AppBar({
  title,
  sub,
  back,
  actions,
}: {
  title: ReactNodeLike;
  sub?: ReactNodeLike;
  back?: string;
  actions?: ReactNodeLike;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-rule bg-paper/82 px-4 backdrop-blur-xl backdrop-saturate-150 lg:px-8">
      {back ? (
        <Link
          href={back}
          className="-ml-2 grid size-9 place-items-center rounded-md text-ink-secondary hover:bg-rule-faint lg:hidden"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-md font-semibold">{title}</h1>
        {sub ? <p className="truncate text-xs text-ink-tertiary">{sub}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}

type ReactNodeLike = React.ReactNode;

/* ------------------------------------------------------ command trigger */

/** The platform never changes mid-session, so it never notifies. */
const neverChanges = () => () => {};

/**
 * Which modifier key to label the shortcut with.
 *
 * `useSyncExternalStore` rather than an effect: the value differs between
 * server and client, and this is the hook built for exactly that. Reading it in
 * an effect would render "Ctrl", then immediately render again as "⌘" — a
 * visible flicker on the one element whose whole job is to be unobtrusive.
 */
function useIsMac(): boolean {
  return useSyncExternalStore(
    neverChanges,
    // userAgent, not the deprecated navigator.platform: "Macintosh" on macOS,
    // "iPhone"/"iPad" on iOS.
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
}

function CommandTrigger() {
  const mac = useIsMac();

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("spendtrack:command"))}
      className="mb-4 flex h-8 w-full items-center gap-2 rounded-md border border-rule-strong bg-surface px-3 text-sm text-ink-tertiary transition-colors hover:bg-sunken"
    >
      <IconSearch size={16} />
      <span>Search or jump…</span>
      <span className="ml-auto">
        <Kbd>{mac ? "⌘" : "Ctrl"}K</Kbd>
      </span>
    </button>
  );
}

export { NAV_GROUPS };
