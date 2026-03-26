export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-surface rounded-lg ${className}`}
      style={{ animation: "skeletonPulse 2s ease-in-out infinite" }}
      aria-hidden="true"
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-surface rounded-xl p-5 border border-border">
      <Skeleton className="h-4 w-1/3 mb-3" />
      <Skeleton className="h-3 w-2/3 mb-2" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}
