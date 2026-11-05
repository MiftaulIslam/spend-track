import { Skeleton } from "@/src/components/ui";

/** Route-level skeleton, shaped like the dashboard so nothing shifts. */
export default function Loading() {
  return (
    <div className="flex-1">
      <div className="h-14 border-b border-rule" />
      <div className="mx-auto w-full max-w-[1320px] px-4 lg:px-8">
        <div className="pt-6 pb-5">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="mt-3 h-11 w-64" />
          <Skeleton className="mt-3 h-4 w-48" />
          <Skeleton className="mt-4 h-16 w-full rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-px overflow-clip rounded-lg border border-rule bg-rule md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 bg-surface p-4">
              <Skeleton className="h-2 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-6 h-40 rounded-lg" />
      </div>
    </div>
  );
}
