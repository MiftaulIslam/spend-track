import { requireUserPage } from "@/src/server/auth/guards";
import { AppBar } from "@/src/components/app-shell";
import { Badge, Dot, EmptyState, Panel, PanelBody, SectionHead } from "@/src/components/ui";
import { IconTag } from "@/src/components/icons";
import * as categoryService from "@/src/server/services/category-service";
import type { CategoryNode } from "@/src/server/services/category-service";

export const metadata = { title: "Categories" };

/**
 * Categories.
 *
 * Grouped by kind rather than shown as one list, because an expense category
 * and an income category are never alternatives to each other — nobody is
 * deciding between "Groceries" and "Salary". Children are indented under their
 * parent so the hierarchy reads without a disclosure control.
 */

const KINDS = [
  { kind: "EXPENSE", label: "Spending" },
  { kind: "INCOME", label: "Income" },
  { kind: "TRANSFER", label: "Transfers" },
] as const;

function CategoryRow({ node, depth }: { node: CategoryNode; depth: number }) {
  return (
    <>
      <div
        className="flex items-center gap-3 border-b border-rule-faint px-4 py-2.5 last:border-b-0"
        style={{ paddingLeft: `${16 + depth * 20}px` }}
      >
        <Dot index={node.colorIndex} />
        <span className="flex-1 truncate text-sm">{node.name}</span>
        {node.isSystem ? <Badge>Built in</Badge> : null}
        {node.archivedAt ? <Badge tone="neutral">Archived</Badge> : null}
        <span className="num text-xs text-ink-tertiary">
          {node.transactionCount > 0 ? `${node.transactionCount}` : "—"}
        </span>
      </div>
      {node.children.map((child) => (
        <CategoryRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default async function CategoriesPage() {
  const actor = await requireUserPage("/categories");
  const tree = await categoryService.tree(actor, {});

  const total = (function count(nodes: CategoryNode[]): number {
    return nodes.reduce((sum, n) => sum + 1 + count(n.children), 0);
  })(tree);

  return (
    <>
      <AppBar title="Categories" sub={`${total} in use`} />
      <main className="mb-tabbar flex-1 lg:mb-0">
        <div className="mx-auto w-full max-w-[880px] px-4 py-6 lg:px-8">
          {total === 0 ? (
            <Panel>
              <EmptyState
                icon={<IconTag />}
                title="No categories yet"
                body="Categories are seeded when your account is created. If this is empty, something went wrong during setup."
              />
            </Panel>
          ) : (
            <div className="flex flex-col gap-6">
              {KINDS.map(({ kind, label }) => {
                const nodes = tree.filter((n) => n.kind === kind);
                if (nodes.length === 0) return null;
                return (
                  <section key={kind}>
                    <SectionHead title={label} meta={`${nodes.length} top level`} />
                    <Panel className="mt-3">
                      <PanelBody className="px-0 pb-0">
                        {nodes.map((node) => (
                          <CategoryRow key={node.id} node={node} depth={0} />
                        ))}
                      </PanelBody>
                    </Panel>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
