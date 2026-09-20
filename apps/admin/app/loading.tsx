export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Laadin sisu">
      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-border" />
        <div className="h-8 w-56 animate-pulse rounded bg-border" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-border" />
      </div>
      <div className="panel grid grid-cols-2 divide-x divide-y divide-border overflow-hidden lg:grid-cols-4 lg:divide-y-0">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2 p-5">
            <div className="h-3 w-20 animate-pulse rounded bg-border" />
            <div className="h-7 w-24 animate-pulse rounded bg-border" />
          </div>
        ))}
      </div>
      <div className="panel space-y-3 p-4">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-bg" />)}
      </div>
    </div>
  );
}
