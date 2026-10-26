export default function ApplicationLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="h-4 w-16 animate-pulse rounded bg-subtle" />
      <div className="mt-3 h-8 w-64 animate-pulse rounded bg-subtle" />
      <div className="mt-2 h-4 w-40 animate-pulse rounded bg-subtle" />
      <div className="mt-8 grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-1 animate-pulse rounded-full bg-subtle" />
        ))}
      </div>
      <div className="mt-6 h-72 animate-pulse rounded-lg border border-line bg-surface" />
    </main>
  );
}