"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { Rail, TabBar, NAV_GROUPS, type ShellBadges, type ShellUser } from "./app-shell";
import { CommandPalette } from "./command-palette";
import { QuickAdd, type QuickAddAccount, type QuickAddCategory } from "./quick-add";
import { Sheet, SheetBody, SheetContent } from "./sheet";
import { cn } from "./ui";
import { IconActivity, IconLogout, IconMoon, IconSun } from "./icons";

/**
 * Client chrome.
 *
 * The one client component in the app shell. It owns the state that has to be
 * client-side — is the sheet open, is the palette open — so every page and
 * panel underneath can stay a Server Component and ship no JavaScript.
 */

export function AppChrome({
  user,
  badges,
  accounts,
  categories,
  recentCategoryIds,
  today,
}: {
  user: ShellUser;
  badges: ShellBadges;
  accounts: QuickAddAccount[];
  categories: QuickAddCategory[];
  recentCategoryIds: string[];
  /** Today in the user's timezone, resolved on the server. */
  today: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // "n" adds a transaction, the way every fast tool works — but never while
  // the user is typing into something.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "n") {
        e.preventDefault();
        setAddOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Rail user={user} badges={badges} />
      <TabBar onAdd={() => setAddOpen(true)} onMore={() => setMoreOpen(true)} />
      <CommandPalette onQuickAdd={() => setAddOpen(true)} />
      <QuickAdd
        open={addOpen}
        onOpenChange={setAddOpen}
        accounts={accounts}
        categories={categories}
        recentCategoryIds={recentCategoryIds}
        today={today}
      />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} user={user} badges={badges} />
    </>
  );
}

/** Everything the five-slot tab bar cannot hold. */
function MoreSheet({
  open,
  onOpenChange,
  user,
  badges,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: ShellUser;
  badges: ShellBadges;
}) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    onOpenChange(false);
    // Close on navigation, or the sheet stays up over the new page.
  }, [pathname, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Everything else">
        <SheetBody className="pb-4">
          <div className="flex items-center gap-3 border-b border-rule px-4 py-4">
            <span className="grid size-11 place-items-center rounded-md bg-brass-wash font-mono text-sm font-semibold text-brass-deep">
              {user.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{user.name}</p>
              <p className="truncate text-xs text-ink-tertiary">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="grid size-9 place-items-center rounded-md border border-rule text-ink-secondary"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="px-4 pt-4">
              <div className="eyebrow pb-2">{group.label}</div>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map(({ href, label, Icon, badgeKey }) => {
                  const badge = badgeKey ? badges[badgeKey as keyof ShellBadges] : undefined;
                  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm",
                        active ? "border-brass/40 bg-brass-wash text-ink" : "border-rule bg-surface text-ink-secondary",
                      )}
                    >
                      <Icon size={17} className="shrink-0" />
                      <span className="truncate">{label}</span>
                      {badge ? <span className="num ml-auto text-2xs text-ink-tertiary">{badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mt-4 border-t border-rule px-4 pt-4">
            {user.isAdmin ? (
              <Link
                href="/admin"
                className="mb-2 flex items-center gap-2.5 rounded-md border border-rule bg-surface px-3 py-2.5 text-sm"
              >
                <IconActivity size={17} />
                Platform admin
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void signOut({ redirectTo: "/signin" })}
              className="flex w-full items-center gap-2.5 rounded-md border border-rule bg-surface px-3 py-2.5 text-sm text-danger"
            >
              <IconLogout size={17} />
              Sign out
            </button>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
