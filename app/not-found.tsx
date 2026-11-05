import Link from "next/link";
import { EmptyState } from "@/src/components/ui";
import { IconSearch } from "@/src/components/icons";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md rounded-lg border border-rule bg-surface">
        <EmptyState
          icon={<IconSearch />}
          title="That page doesn't exist"
          body="The link may be out of date, or the record may have been deleted."
          action={
            <Link
              href="/"
              className="inline-flex h-8 items-center rounded-md bg-ink px-3 text-sm font-medium text-ink-inverse"
            >
              Go to overview
            </Link>
          }
        />
      </div>
    </div>
  );
}
