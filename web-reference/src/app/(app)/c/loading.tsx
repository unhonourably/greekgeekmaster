import PageLoading from "@/components/page-loading";

export default function Loading() {
  return (
    <div className="flex flex-1">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block" />
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        <PageLoading />
      </div>
    </div>
  );
}
