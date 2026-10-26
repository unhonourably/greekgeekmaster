import type { Metadata } from "next";
import { PageHeader, TextLink } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/modules";
import { createRooms } from "../../actions";
import { RoomBuilder } from "./room-builder";

export const metadata: Metadata = { title: "Add rooms" };

export default async function AddRoomsPage({ params }: PageProps<"/c/[slug]/housing/rooms/new">) {
  const { slug } = await params;
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("housing_rooms").select("name").eq("chapter_id", chapter.id).is("archived_at", null).limit(1000);
  const existing = (data ?? []).map((r) => r.name as string);

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href={`/c/${slug}/housing/rooms`}>Rooms</TextLink>}
        title="Add rooms"
        description={existing.length ? `Set up the whole house at once. ${existing.length} room${existing.length === 1 ? " is" : "s are"} already added and will be skipped.` : "Set up the whole house at once. Pick a numbering format, set the details, and check the preview."}
      />
      <RoomBuilder action={createRooms.bind(null, slug)} existing={existing} />
    </>
  );
}
