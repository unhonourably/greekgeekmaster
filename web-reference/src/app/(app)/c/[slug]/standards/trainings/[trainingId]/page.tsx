import { notFound, redirect } from "next/navigation";
import { SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, PageHeader, Table, Td, TextLink, Th, Tr } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireModule } from "@/lib/modules";
import { CLASS_LABEL } from "../../labels";
import { verifyTraining } from "../../actions";

export default async function TrainingPage({ params }: PageProps<"/c/[slug]/standards/trainings/[trainingId]">) {
  const { slug, trainingId } = await params;
  const { chapter, user, can } = await requireModule(slug, "standards");
  const manage = can("standards.manage");
  if (!manage && !can("standards.view")) redirect(`/c/${slug}/standards`);
  const supabase = await createClient();
  const { data: training } = await supabase.from("training_requirements").select("id, title, description, due_on, applies_to").eq("id", trainingId).eq("chapter_id", chapter.id).maybeSingle();
  if (!training) notFound();
  const [{ data: members }, { data: completions }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, user_id, member_class, profile:profiles!memberships_user_id_fkey(display_name, full_name)")
      .eq("chapter_id", chapter.id)
      .eq("status", "active")
      .in("member_class", training.applies_to)
      .limit(1000),
    supabase.from("training_completions").select("user_id, completed_at, verified_at").eq("requirement_id", training.id),
  ]);
  const done = new Map((completions ?? []).map((c) => [c.user_id, c]));
  const rows = ((members ?? []) as unknown as Array<{ id: string; user_id: string; member_class: string; profile: { display_name: string | null; full_name: string | null } | null }>)
    .map((m) => ({ ...m, name: m.profile ? (m.profile.full_name || m.profile.display_name || "Member") : "Member", completion: done.get(m.user_id) }))
    .sort((a, b) => Number(Boolean(a.completion)) - Number(Boolean(b.completion)) || a.name.localeCompare(b.name));
  const completeCount = rows.filter((r) => r.completion).length;

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href={`/c/${slug}/standards`}>Standards</TextLink>}
        title={training.title}
        description={[training.due_on ? `Due ${formatDate(training.due_on, "UTC")}` : "No due date", training.applies_to.map((c: string) => CLASS_LABEL[c] ?? c).join(", ")].join(" · ")}
      />
      <Card>
        <CardHeader title="Completion" description={`${completeCount} of ${rows.length} members`} />
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Completed</Th>
                <Th align="right">Verification</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.name}</Td>
                  <Td>{r.completion ? formatDateTime(r.completion.completed_at, chapter.timezone) : <span className="text-ink-3">Not yet</span>}</Td>
                  <Td align="right">
                    {!r.completion ? null : r.completion.verified_at ? (
                      <Badge tone="positive">Verified</Badge>
                    ) : manage && r.user_id !== user.id ? (
                      <form action={verifyTraining.bind(null, slug, training.id, r.user_id)}>
                        <SubmitButton size="sm" variant="secondary">Verify</SubmitButton>
                      </form>
                    ) : (
                      <Badge tone="info">Awaiting verification</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
    </>
  );
}
