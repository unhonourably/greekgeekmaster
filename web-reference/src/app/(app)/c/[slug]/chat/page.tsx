import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { ConversationSidebar } from "./sidebar";

export default async function ChatIndexPage({ params }: PageProps<"/c/[slug]/chat">) {
  const { slug } = await params;
  return (
    <>
      <div className="h-full md:hidden">
        <ConversationSidebar slug={slug} />
      </div>
      <div className="hidden flex-1 items-center justify-center p-8 md:flex">
        <EmptyState icon={MessagesSquare} title="Pick a conversation">
          Choose a channel or direct message on the left, or start a new one.
        </EmptyState>
      </div>
    </>
  );
}
