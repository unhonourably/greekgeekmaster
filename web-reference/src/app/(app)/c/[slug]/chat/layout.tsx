import { ConversationSidebar } from "./sidebar";

export default async function ChatLayout({ children, params }: LayoutProps<"/c/[slug]/chat">) {
  const { slug } = await params;
  return (
    <div className="flex h-[calc(100dvh-3.5rem-2.8125rem)] min-h-0 lg:h-[calc(100dvh-3.5rem)]">
      <aside className="hidden w-80 shrink-0 border-r border-line bg-surface md:block">
        <ConversationSidebar slug={slug} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">{children}</div>
    </div>
  );
}
