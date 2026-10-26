import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { Avatar, personName } from "@/components/people";
import { Badge, Button, Card, CardBody, CardHeader, Notice, PageHeader, Select, TextLink } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, requestTime } from "@/lib/format";
import { utcToZonedParts } from "@/lib/timezone";
import { membershipsWithPermission } from "@/lib/roles";
import { ACTIVITY_LABEL, OUTCOME_LABEL, OUTCOME_TONE, PROSPECT_COLUMNS, type ActivityKind, type Prospect } from "@/lib/recruitment";
import { addNote, inviteProspect, logActivity, moveProspect, saveProspect, setProspectStatus } from "../actions";
import { loadStages, memberNames, requireRecruitment } from "../data";
import { ActivityForm, NoteForm, ProspectForm } from "../forms";

type Author = { display_name: string | null; full_name: string | null; avatar_path: string | null } | null;
type Note = { id: string; body: string; restricted: boolean; created_at: string; author_id: string; author: Author };
type Activity = { id: string; kind: ActivityKind; occurred_at: string; notes: string | null; event: { title: string } | null; logger: Author };
type History = { id: number; from_stage: string | null; to_stage: string; created_at: string };

export default async function ProspectPage({ params, searchParams }: PageProps<"/c/[slug]/recruitment/[prospectId]">) {
  const { slug, prospectId } = await params;
  const sp = await searchParams;
  const { chapter, membership, can } = await requireRecruitment(slug);
  const canManage = can("recruitment.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("prospects").select(PROSPECT_COLUMNS).eq("id", prospectId).eq("chapter_id", chapter.id).maybeSingle();
  if (!data) notFound();
  const p = data as Prospect;
  const tz = chapter.timezone;
  const now = requestTime();
  const [stages, { data: noteData }, { data: activityData }, { data: historyData }, { data: eventData }] = await Promise.all([
    loadStages(chapter.id),
    supabase.from("prospect_notes").select("id, body, restricted, created_at, author_id, author:profiles(display_name, full_name, avatar_path)").eq("prospect_id", p.id).order("created_at", { ascending: false }),
    supabase.from("recruitment_activities").select("id, kind, occurred_at, notes, event:events(title), logger:profiles(display_name, full_name, avatar_path)").eq("prospect_id", p.id).order("occurred_at", { ascending: false }),
    supabase.from("prospect_stage_history").select("id, from_stage, to_stage, created_at").eq("prospect_id", p.id).order("created_at", { ascending: false }),
    supabase.from("events").select("id, title, starts_at").eq("chapter_id", chapter.id).eq("category", "recruitment").is("cancelled_at", null).lte("starts_at", new Date(now).toISOString()).order("starts_at", { ascending: false }).limit(30),
  ]);
  const notes = (noteData ?? []) as unknown as Note[];
  const activities = (activityData ?? []) as unknown as Activity[];
  const history = (historyData ?? []) as History[];
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const stage = stages.find((s) => s.id === p.stage_id);
  const canEdit = canManage || p.owner_membership_id === membership.id;
  const eligible = canManage ? await membershipsWithPermission(chapter.id, "recruitment.view") : new Set<string>();
  const names = await memberNames(chapter.id, [...eligible, p.owner_membership_id ?? ""]);
  const owners = canManage ? [...eligible].map((id) => ({ id, name: names.get(id) ?? "Member" })).sort((a, b) => a.name.localeCompare(b.name)) : null;
  const error = typeof sp.error === "string" ? sp.error.slice(0, 200) : null;
  const devLink = typeof sp.dev === "string" && sp.dev.startsWith("http") ? sp.dev : null;
  const followUp = p.next_follow_up_at ? utcToZonedParts(p.next_follow_up_at, tz).date : "";
  const today = utcToZonedParts(new Date(now), tz).date;

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href={`/c/${slug}/recruitment`}>Recruitment</TextLink>}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.full_name}
            {stage ? <Badge tone={OUTCOME_TONE[stage.outcome]}>{stage.name}</Badge> : null}
            {p.status === "archived" ? <Badge>Archived</Badge> : null}
          </span>
        }
        description={`Assigned to ${p.owner_membership_id ? names.get(p.owner_membership_id) ?? "a member" : "nobody"} · added ${formatDate(p.created_at, tz)}`}
        actions={
          canManage ? (
            <form action={setProspectStatus.bind(null, slug, p.id, p.status === "active" ? "archived" : "active")}>
              <Button type="submit" variant="secondary" size="sm">{p.status === "active" ? "Archive" : "Restore"}</Button>
            </form>
          ) : null
        }
      />
      {error ? <Notice tone="danger" className="mb-6">{error}</Notice> : null}
      {sp.invited ? (
        <Notice tone="positive" title="Invitation sent" className="mb-6">
          {devLink ? (
            <>
              Email is not configured, so here is the link to share manually: <span className="break-all font-mono text-[12px]">{devLink}</span>
            </>
          ) : (
            `${p.email} will receive a link to join the chapter as a new member.`
          )}
        </Notice>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" description={canEdit ? undefined : "Only the assigned recruiter or the recruitment chair can edit."} />
            <CardBody className="py-5">
              <ProspectForm
                action={saveProspect.bind(null, slug, p.id)}
                owners={owners}
                readOnly={!canEdit}
                initial={{
                  full_name: p.full_name,
                  preferred_name: p.preferred_name ?? "",
                  email: p.email ?? "",
                  phone: p.phone ?? "",
                  class_year: p.class_year ? String(p.class_year) : "",
                  major: p.major ?? "",
                  hometown: p.hometown ?? "",
                  source: p.source ?? "",
                  interests: p.interests.join(", "),
                  follow_up: followUp,
                  owner: p.owner_membership_id ?? "",
                }}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Notes" description="Restricted notes are visible only to their author and the recruitment chair." />
            <CardBody className="space-y-5">
              <NoteForm action={addNote.bind(null, slug, p.id)} />
              {notes.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {notes.map((n) => {
                    const name = n.author ? personName(n.author) : "Former member";
                    return (
                      <li key={n.id} className="flex gap-3 py-3">
                        <Avatar name={name} path={n.author?.avatar_path} size="xs" className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                            <span className="font-medium text-ink-2">{name}</span>
                            {formatDateTime(n.created_at, tz)}
                            {n.restricted ? (
                              <span className="inline-flex items-center gap-1 text-warning">
                                <Lock className="size-3" aria-hidden />
                                Restricted
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{n.body}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          {canEdit && p.status === "active" ? (
            <Card>
              <CardHeader title="Stage" />
              <CardBody>
                <form action={moveProspect.bind(null, slug, p.id)} className="flex gap-2">
                  <Select name="stage" defaultValue={p.stage_id} aria-label="Stage" className="flex-1">
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({OUTCOME_LABEL[s.outcome]})
                      </option>
                    ))}
                  </Select>
                  <SubmitButton variant="secondary">Move</SubmitButton>
                </form>
              </CardBody>
            </Card>
          ) : null}
          {stage?.outcome === "joined" && (can("members.manage") || can("recruitment.manage")) && p.email ? (
            <Card>
              <CardHeader title="Invite to the chapter" description={`Sends an invitation to ${p.email} as a new member.`} />
              <CardBody>
                <form action={inviteProspect.bind(null, slug, p.id)}>
                  <ConfirmSubmit variant="primary" size="md" message={`Send an invitation to ${p.email}?`}>Send invitation</ConfirmSubmit>
                </form>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Activity" />
            <CardBody className="space-y-4">
              <ActivityForm action={logActivity.bind(null, slug, p.id)} today={today} events={((eventData ?? []) as Array<{ id: string; title: string; starts_at: string }>).map((e) => ({ id: e.id, label: `${e.title} · ${formatDate(e.starts_at, tz)}` }))} />
              {activities.length ? (
                <ul className="space-y-3 border-t border-line pt-4">
                  {activities.map((a) => (
                    <li key={a.id} className="text-sm">
                      <p className="text-ink">
                        {ACTIVITY_LABEL[a.kind]}
                        {a.event ? `: ${a.event.title}` : ""}
                      </p>
                      <p className="text-[12px] text-ink-3">
                        {formatDate(a.occurred_at, tz)} · {a.logger ? personName(a.logger) : "Member"}
                      </p>
                      {a.notes ? <p className="mt-0.5 text-[13px] text-ink-2">{a.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Stage history" />
            <CardBody>
              <ol className="space-y-2 text-[13px]">
                {history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-3">
                    <span className="text-ink-2">{h.from_stage ? `${stageName.get(h.from_stage) ?? "Removed stage"} to ${stageName.get(h.to_stage) ?? "Removed stage"}` : `Added to ${stageName.get(h.to_stage) ?? "pipeline"}`}</span>
                    <span className="shrink-0 text-ink-3">{formatDate(h.created_at, tz)}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
