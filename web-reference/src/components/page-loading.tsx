export default function PageLoading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading">
      <div className="mb-8 space-y-2">
        <div className="h-7 w-56 rounded bg-subtle" />
        <div className="h-4 w-96 max-w-full rounded bg-subtle/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-24 rounded-lg border border-line bg-surface" />
        <div className="h-24 rounded-lg border border-line bg-surface" />
        <div className="h-24 rounded-lg border border-line bg-surface" />
      </div>
      <div className="mt-6 space-y-3 rounded-lg border border-line bg-surface p-5">
        <div className="h-4 w-2/3 rounded bg-subtle" />
        <div className="h-4 w-1/2 rounded bg-subtle/70" />
        <div className="h-4 w-3/5 rounded bg-subtle" />
        <div className="h-4 w-2/5 rounded bg-subtle/70" />
      </div>
    </div>
  );
}

export function SectionLoading() {
  return (
    <div className="animate-pulse space-y-3 rounded-lg border border-line bg-surface p-5" role="status" aria-label="Loading">
      <div className="h-4 w-2/3 rounded bg-subtle" />
      <div className="h-4 w-1/2 rounded bg-subtle/70" />
      <div className="h-4 w-3/5 rounded bg-subtle" />
      <div className="h-4 w-2/5 rounded bg-subtle/70" />
    </div>
  );
}

export function ChatLoading() {
  return (
    <div className="flex flex-1 animate-pulse flex-col" role="status" aria-label="Loading">
      <div className="h-14 shrink-0 border-b border-line bg-surface" />
      <div className="flex-1 space-y-4 p-6">
        <div className="h-10 w-2/5 rounded-2xl bg-subtle" />
        <div className="ml-auto h-10 w-1/3 rounded-2xl bg-subtle" />
        <div className="h-10 w-1/2 rounded-2xl bg-subtle" />
      </div>
    </div>
  );
}
