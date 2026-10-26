import type { Metadata } from "next";
import { BedDouble, DoorOpen, Inbox, Plus } from "lucide-react";
import { SimpleForm } from "@/components/simple-form";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, Notice, PageHeader, Stat, StatGrid, Table, Td, Th, TextLink, Tr, cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTime } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { activeMembers, requireModule, todayIn } from "@/lib/modules";
import { REQUEST_STATUS, isCurrent, isUpcoming, type Assignment, type Room } from "../labels";
import { archiveRoom, assignRoom, billRent, deleteHousingRequest, endAssignment, respondHousingRequest, saveRoom } from "../actions";

export const metadata: Metadata = { title: "Rooms" };

type Request = {
  id: string;
  membership_id: string;
  term_label: string;
  preferred_room_ids: string[];
  roommate_membership_ids: string[];
  wants_single: boolean;
  notes: string | null;
  status: keyof typeof REQUEST_STATUS;
  created_at: string;
};

function Occupancy({ used, capacity }: { used: number; capacity: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${used} of ${capacity} beds filled`}>
      {Array.from({ length: capacity }, (_, i) => (
        <span key={i} className={cx("size-2 rounded-full", i < used ? "bg-accent" : "border border-line-strong")} />
      ))}
    </span>
  );
}

export default async function RoomsPage({ params, searchParams }: PageProps<"/c/[slug]/housing/rooms">) {
  const { slug } = await params;
  const { error: errorParam, added, skipped } = await searchParams;
  const addedCount = typeof added === "string" ? Number(added) || 0 : null;
  const skippedCount = typeof skipped === "string" ? Number(skipped) || 0 : 0;
  const { chapter, can } = await requireModule(slug, "housing", "housing.manage");
  const supabase = await createClient();
  const today = todayIn(chapter.timezone, requestTime());
  const yearAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);

  const [roomsRes, assignmentsRes, requestsRes, members] = await Promise.all([
    supabase.from("housing_rooms").select("id, name, floor, capacity, rent_cents, features, notes, archived_at").eq("chapter_id", chapter.id).order("name"),
    supabase
      .from("room_assignments")
      .select("id, room_id, membership_id, bed_label, starts_on, ends_on, end_reason")
      .eq("chapter_id", chapter.id)
      .or(`ends_on.is.null,ends_on.gte.${yearAgo}`)
      .order("starts_on", { ascending: false })
      .limit(1000),
    supabase
      .from("housing_requests")
      .select("id, membership_id, term_label, preferred_room_ids, roommate_membership_ids, wants_single, notes, status, created_at")
      .eq("chapter_id", chapter.id)
      .in("status", ["submitted", "waitlisted"])
      .order("created_at")
      .limit(200),
    activeMembers(chapter.id),
  ]);
  const rooms = ((roomsRes.data ?? []) as Room[]).map((r) => ({ ...r, rent_cents: r.rent_cents === null ? null : Number(r.rent_cents) }));
  const live = rooms.filter((r) => !r.archived_at);
  const archived = rooms.filter((r) => r.archived_at);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const assignments = (assignmentsRes.data ?? []) as Assignment[];
  const requests = (requestsRes.data ?? []) as Request[];
  const name = new Map(members.map((m) => [m.id, m.name]));
  const who = (id: string) => name.get(id) ?? "Former member";

  const current = assignments.filter((a) => isCurrent(a, today));
  const upcoming = assignments.filter((a) => isUpcoming(a, today));
  const history = assignments.filter((a) => a.ends_on !== null && a.ends_on < today).slice(0, 25);
  const homeOf = new Map(current.map((a) => [a.membership_id, roomName.get(a.room_id) ?? "a room"]));
  const beds = live.reduce((s, r) => s + r.capacity, 0);
  const filled = live.reduce((s, r) => s + Math.min(r.capacity, current.filter((a) => a.room_id === r.id).length), 0);
  const memberOptions = members.map((m) => ({ value: m.id, label: homeOf.has(m.id) ? `${m.name} (lives in ${homeOf.get(m.id)})` : m.name }));
  const billable = current.filter((a) => {
    const r = rooms.find((x) => x.id === a.room_id);
    return r?.rent_cents && r.rent_cents >= 50;
  });
  const rentTotal = billable.reduce((s, a) => s + (rooms.find((x) => x.id === a.room_id)?.rent_cents ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href={`/c/${slug}/housing`}>Housing</TextLink>}
        title="Rooms"
        description="Who lives where, open beds, move-ins and move-outs, and housing requests."
        actions={
          <div className="flex gap-2">
            <ButtonLink href={`/c/${slug}/housing/manage`} variant="secondary">Maintenance and chores</ButtonLink>
            <ButtonLink href={`/c/${slug}/housing/rooms/new`}>
              <Plus className="size-4" aria-hidden />
              Add rooms
            </ButtonLink>
          </div>
        }
      />
      {typeof errorParam === "string" ? <Notice tone="danger" className="mb-6">{errorParam}</Notice> : null}
      {addedCount !== null ? (
        <Notice tone="positive" className="mb-6">
          {addedCount ? `Added ${addedCount} room${addedCount === 1 ? "" : "s"}.` : "No new rooms were added."}
          {skippedCount ? ` ${skippedCount} already existed and ${skippedCount === 1 ? "was" : "were"} skipped.` : ""}
          {addedCount ? " Assign residents from each room card." : ""}
        </Notice>
      ) : null}
      <StatGrid className="mb-8 lg:grid-cols-4">
        <Stat label="Living in house" value={current.length} hint={upcoming.length ? `${upcoming.length} moving in soon` : undefined} />
        <Stat label="Open beds" value={Math.max(0, beds - filled)} tone={beds > 0 && filled >= beds ? "positive" : undefined} hint={`${beds} beds across ${live.length} rooms`} />
        <Stat label="Occupancy" value={beds ? `${Math.round((filled / beds) * 100)}%` : "None"} />
        <Stat label="Open requests" value={requests.length} tone={requests.length ? "warning" : undefined} />
      </StatGrid>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          {live.length === 0 ? (
            <Card>
              <EmptyState icon={DoorOpen} title="No rooms yet" action={<ButtonLink href={`/c/${slug}/housing/rooms/new`}>Set up your rooms</ButtonLink>}>
                Add every bedroom at once with a numbering format like 101, 102, 201. Then assign residents.
              </EmptyState>
            </Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {live.map((r) => {
                const here = current.filter((a) => a.room_id === r.id);
                const soon = upcoming.filter((a) => a.room_id === r.id);
                const open = r.capacity - here.length;
                return (
                  <Card key={r.id} className="flex flex-col">
                    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                      <div className="min-w-0">
                        <h2 className="truncate text-[15px] font-semibold text-ink">{r.name}</h2>
                        <p className="text-[12px] text-ink-3">
                          {[r.floor, `Sleeps ${r.capacity}`, r.rent_cents ? `${formatCents(r.rent_cents)} rent` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <Occupancy used={Math.min(here.length, r.capacity)} capacity={r.capacity} />
                        <span className="text-[11px] text-ink-3">{open > 0 ? `${open} open` : "Full"}</span>
                      </div>
                    </div>
                    {r.features.length ? (
                      <div className="flex flex-wrap gap-1.5 px-5 pt-3">
                        {r.features.map((f) => <Badge key={f}>{f}</Badge>)}
                      </div>
                    ) : null}
                    <ul className="flex-1 divide-y divide-line">
                      {[...here, ...soon].map((a) => (
                        <li key={a.id} className="px-5 py-3">
                          <details>
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">
                                  {who(a.membership_id)}
                                  {a.bed_label ? <span className="font-normal text-ink-3"> · Bed {a.bed_label}</span> : null}
                                </p>
                                <p className="text-[12px] text-ink-3">
                                  {isUpcoming(a, today) ? `Moves in ${formatDate(a.starts_on, "UTC")}` : `Since ${formatDate(a.starts_on, "UTC")}`}
                                  {a.ends_on ? ` · out ${formatDate(a.ends_on, "UTC")}` : ""}
                                </p>
                              </div>
                              <span className="shrink-0 text-[12px] text-ink-3">{isUpcoming(a, today) ? "Change" : "Move out"}</span>
                            </summary>
                            <div className="mt-3 border-t border-line pt-3">
                              <SimpleForm
                                action={endAssignment.bind(null, slug, a.id)}
                                submitLabel={isUpcoming(a, today) ? "Save" : "Set move-out"}
                                fields={[
                                  { name: "ends_on", label: "Last night", type: "date", defaultValue: a.ends_on ?? today, span: "half", hint: isUpcoming(a, today) ? "Before move-in cancels it" : undefined },
                                  { name: "reason", label: "Reason", placeholder: "Graduated, moved out", maxLength: 200, span: "half" },
                                ]}
                              />
                            </div>
                          </details>
                        </li>
                      ))}
                      {here.length + soon.length === 0 ? <li className="px-5 py-3 text-[13px] text-ink-3">Empty</li> : null}
                    </ul>
                    <div className="space-y-3 border-t border-line px-5 py-3">
                      {open > 0 && memberOptions.length ? (
                        <details>
                          <summary className="cursor-pointer list-none text-[13px] font-medium text-accent [&::-webkit-details-marker]:hidden">Assign someone</summary>
                          <div className="mt-3">
                            <SimpleForm
                              action={assignRoom.bind(null, slug, r.id)}
                              submitLabel="Assign"
                              fields={[
                                { name: "membership_id", label: "Member", type: "select", options: memberOptions, hint: "Assigning someone who lives elsewhere moves them." },
                                { name: "bed", label: "Bed", placeholder: "A", maxLength: 20, span: "third" },
                                { name: "starts_on", label: "Move in", type: "date", defaultValue: today, span: "third" },
                                { name: "ends_on", label: "Move out", type: "date", span: "third" },
                              ]}
                            />
                          </div>
                        </details>
                      ) : null}
                      <details>
                        <summary className="cursor-pointer list-none text-[13px] text-ink-3 hover:text-ink-2 [&::-webkit-details-marker]:hidden">Edit room</summary>
                        <div className="mt-3 space-y-3">
                          <SimpleForm
                            action={saveRoom.bind(null, slug, r.id)}
                            submitLabel="Save room"
                            resetOnSuccess={false}
                            fields={[
                              { name: "name", label: "Name", defaultValue: r.name, maxLength: 60, span: "half" },
                              { name: "floor", label: "Floor", defaultValue: r.floor ?? "", maxLength: 40, span: "half" },
                              { name: "capacity", label: "Sleeps", type: "number", min: "1", max: "12", defaultValue: String(r.capacity), span: "half" },
                              { name: "rent", label: "Rent", type: "money", defaultValue: r.rent_cents ? (r.rent_cents / 100).toFixed(2) : "", span: "half" },
                              { name: "features", label: "Features", defaultValue: r.features.join(", "), placeholder: "Private bath, AC", hint: "Separate with commas." },
                              { name: "notes", label: "Notes", type: "textarea", defaultValue: r.notes ?? "", maxLength: 500 },
                            ]}
                          />
                          {here.length + soon.length === 0 ? (
                            <form action={archiveRoom.bind(null, slug, r.id, true)}>
                              <SubmitButton size="sm" variant="ghost">Archive room</SubmitButton>
                            </form>
                          ) : null}
                        </div>
                      </details>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <Card>
            <CardHeader title="Housing requests" description="Members ask for rooms and roommates for an upcoming term." />
            {requests.length === 0 ? (
              <EmptyState icon={Inbox} title="No open requests">Requests from members show up here.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {requests.map((q) => (
                  <li key={q.id} className="px-5 py-3">
                    <details>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">{who(q.membership_id)} <span className="font-normal text-ink-3">· {q.term_label}</span></p>
                          <p className="text-[12px] text-ink-3">
                            {[
                              q.wants_single ? "Wants a single" : null,
                              q.preferred_room_ids.length ? `Rooms: ${q.preferred_room_ids.map((id) => roomName.get(id) ?? "Removed").join(", ")}` : null,
                              q.roommate_membership_ids.length ? `With: ${q.roommate_membership_ids.map(who).join(", ")}` : null,
                              homeOf.has(q.membership_id) ? `Now in ${homeOf.get(q.membership_id)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "No preferences"}
                          </p>
                        </div>
                        <Badge tone={REQUEST_STATUS[q.status].tone}>{REQUEST_STATUS[q.status].label}</Badge>
                      </summary>
                      <div className="mt-3 space-y-3 border-t border-line pt-3">
                        {q.notes ? <p className="whitespace-pre-wrap text-[13px] text-ink-2">{q.notes}</p> : null}
                        <p className="text-[12px] text-ink-3">Assigning them a room marks this request placed automatically.</p>
                        <SimpleForm
                          action={respondHousingRequest.bind(null, slug, q.id)}
                          submitLabel="Send response"
                          fields={[
                            { name: "status", label: "Answer", type: "select", defaultValue: "waitlisted", options: [{ value: "waitlisted", label: "Waitlist" }, { value: "declined", label: "Not placed" }], span: "half" },
                            { name: "response", label: "Note to the member", maxLength: 500, span: "half" },
                          ]}
                        />
                        <form action={deleteHousingRequest.bind(null, slug, q.id)}>
                          <ConfirmSubmit message="Delete this housing request?">Delete request</ConfirmSubmit>
                        </form>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Room history" description="Move-outs from the past year." />
            {history.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-3">Nobody has moved out yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Member</Th>
                      <Th>Room</Th>
                      <Th>Stayed</Th>
                      <Th>Reason</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((a) => (
                      <Tr key={a.id}>
                        <Td>{who(a.membership_id)}</Td>
                        <Td>{roomName.get(a.room_id) ?? "Room"}</Td>
                        <Td className="whitespace-nowrap text-ink-2">{formatDate(a.starts_on, "UTC")} to {formatDate(a.ends_on!, "UTC")}</Td>
                        <Td className="text-ink-3">{a.end_reason ?? ""}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader title="Add a room" actions={<TextLink href={`/c/${slug}/housing/rooms/new`} className="text-[13px]">Add many at once</TextLink>} />
            <CardBody>
              <SimpleForm
                action={saveRoom.bind(null, slug, null)}
                submitLabel="Add room"
                fields={[
                  { name: "name", label: "Name", placeholder: "Room 204", maxLength: 60, span: "half" },
                  { name: "floor", label: "Floor", placeholder: "Second", maxLength: 40, span: "half" },
                  { name: "capacity", label: "Sleeps", type: "number", min: "1", max: "12", defaultValue: "2", span: "half" },
                  { name: "rent", label: "Rent", type: "money", span: "half", hint: "Per billing period. Optional." },
                  { name: "features", label: "Features", placeholder: "Private bath, AC", hint: "Separate with commas." },
                ]}
              />
            </CardBody>
          </Card>

          {can("finance.manage") ? (
            <Card>
              <CardHeader title="Bill rent" description="Charges everyone living in the house today their room's rent." />
              <CardBody className="space-y-4">
                <p className="text-[13px] text-ink-2">
                  {billable.length
                    ? `${billable.length} resident${billable.length === 1 ? "" : "s"} · ${formatCents(rentTotal)} total`
                    : "Set rent on rooms with residents to bill it here."}
                </p>
                {billable.length ? (
                  <SimpleForm
                    action={billRent.bind(null, slug)}
                    submitLabel="Bill rent"
                    pendingLabel="Billing"
                    fields={[
                      { name: "title", label: "Title", placeholder: "Spring 2027 rent", maxLength: 120 },
                      { name: "due_date", label: "Due", type: "date", min: today },
                    ]}
                  />
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Not in the house" description={`${members.length - homeOf.size} active members`} />
            <ul className="max-h-72 divide-y divide-line overflow-y-auto">
              {members
                .filter((m) => !homeOf.has(m.id))
                .map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-5 py-2 text-[13px]">
                    <span className="text-ink-2">{m.name}</span>
                    {upcoming.some((a) => a.membership_id === m.id) ? <Badge tone="info">Moving in</Badge> : null}
                  </li>
                ))}
            </ul>
          </Card>

          {archived.length ? (
            <Card>
              <CardHeader title="Archived rooms" />
              <ul className="divide-y divide-line">
                {archived.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="flex items-center gap-2 text-[13px] text-ink-2"><BedDouble className="size-3.5 text-ink-3" aria-hidden />{r.name}</span>
                    <form action={archiveRoom.bind(null, slug, r.id, false)}>
                      <SubmitButton size="sm" variant="ghost">Restore</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
