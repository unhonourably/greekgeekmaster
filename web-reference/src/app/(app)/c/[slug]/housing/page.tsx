import { BedDouble, CalendarClock, ClipboardCheck, Wrench } from "lucide-react";
import { SimpleForm } from "@/components/simple-form";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, Notice, PageHeader, Stat, StatGrid, cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatTime, requestTime } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { activeMembers, requireModule, todayIn } from "@/lib/modules";
import { MAINTENANCE_STATUS, PRIORITY, REQUEST_STATUS, SUPPLY_STATUS, isCurrent, isUpcoming, type Assignment, type Room } from "./labels";
import { cancelReservation, completeChore, deleteHousingRequest, requestSupply, reserveFacility, submitHousingRequest, submitMaintenance } from "./actions";

type Facility = { id: string; name: string; kind: string; reservable: boolean };
type Reservation = { id: string; facility_id: string; user_id: string; starts_at: string; ends_at: string; purpose: string | null };
type Chore = { id: string; title: string; due_on: string; status: "pending" | "done" | "missed" };
type Maintenance = { id: string; title: string; priority: keyof typeof PRIORITY; status: keyof typeof MAINTENANCE_STATUS; created_at: string; submitted_by: string; assigned_membership_id: string | null; resolution_note: string | null; location: string | null };
type Supply = { id: string; item_name: string; quantity: number; status: keyof typeof SUPPLY_STATUS; created_at: string };

export default async function HousingPage({ params, searchParams }: PageProps<"/c/[slug]/housing">) {
  const { slug } = await params;
  const { error: errorParam } = await searchParams;
  const { chapter, user, membership, can } = await requireModule(slug, "housing");
  const manage = can("housing.manage");
  const supabase = await createClient();
  const now = requestTime();
  const nowIso = new Date(now).toISOString();
  const today = todayIn(chapter.timezone, now);

  const [facilitiesRes, reservationsRes, choresRes, maintenanceRes, suppliesRes, roomsRes, assignmentsRes, requestsRes, members] = await Promise.all([
    supabase.from("facilities").select("id, name, kind, reservable").eq("chapter_id", chapter.id).order("name"),
    supabase.from("facility_reservations").select("id, facility_id, user_id, starts_at, ends_at, purpose").eq("chapter_id", chapter.id).eq("status", "confirmed").gt("ends_at", nowIso).order("starts_at").limit(60),
    supabase.from("chores").select("id, title, due_on, status").eq("chapter_id", chapter.id).eq("assigned_membership_id", membership.id).order("due_on", { ascending: false }).limit(30),
    supabase
      .from("maintenance_requests")
      .select("id, title, priority, status, created_at, submitted_by, assigned_membership_id, resolution_note, location")
      .eq("chapter_id", chapter.id)
      .or(`submitted_by.eq.${user.id},assigned_membership_id.eq.${membership.id}`)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("supply_requests").select("id, item_name, quantity, status, created_at").eq("chapter_id", chapter.id).eq("requested_by", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("housing_rooms").select("id, name, floor, capacity, rent_cents, features, notes, archived_at").eq("chapter_id", chapter.id).is("archived_at", null).order("name"),
    supabase.from("room_assignments").select("id, room_id, membership_id, bed_label, starts_on, ends_on, end_reason").eq("chapter_id", chapter.id).or(`ends_on.is.null,ends_on.gte.${today}`).limit(500),
    supabase.from("housing_requests").select("id, term_label, status, response, wants_single, created_at").eq("membership_id", membership.id).neq("status", "withdrawn").order("created_at", { ascending: false }).limit(5),
    activeMembers(chapter.id),
  ]);
  const rooms = (roomsRes.data ?? []) as Room[];
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const assignments = (assignmentsRes.data ?? []) as Assignment[];
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const mine = assignments.filter((a) => a.membership_id === membership.id).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const home = mine.find((a) => isCurrent(a, today));
  const next = mine.find((a) => isUpcoming(a, today));
  const homeRoom = home ? roomById.get(home.room_id) : undefined;
  const roommates = home ? assignments.filter((a) => a.room_id === home.room_id && a.id !== home.id && isCurrent(a, today)) : [];
  const housingRequests = (requestsRes.data ?? []) as Array<{ id: string; term_label: string; status: keyof typeof REQUEST_STATUS; response: string | null; wants_single: boolean; created_at: string }>;
  const roomOptions = [{ value: "", label: "No preference" }, ...rooms.map((r) => ({ value: r.id, label: `${r.name}${r.capacity === 1 ? " (single)" : ""}` }))];
  const mateOptions = [{ value: "", label: "Nobody in particular" }, ...members.filter((m) => m.id !== membership.id).map((m) => ({ value: m.id, label: m.name }))];
  const facilities = (facilitiesRes.data ?? []) as Facility[];
  const reservable = facilities.filter((f) => f.reservable);
  const facilityName = new Map(facilities.map((f) => [f.id, f.name]));
  const reservations = (reservationsRes.data ?? []) as Reservation[];
  const chores = (choresRes.data ?? []) as Chore[];
  const maintenance = (maintenanceRes.data ?? []) as Maintenance[];
  const supplies = (suppliesRes.data ?? []) as Supply[];
  const assignedToMe = maintenance.filter((m) => m.assigned_membership_id === membership.id && m.status !== "closed" && m.status !== "resolved");
  const myRequests = maintenance.filter((m) => m.submitted_by === user.id);
  const pendingChores = chores.filter((c) => c.status === "pending");

  return (
    <>
      <PageHeader
        title="Housing"
        description="Your room, chores, maintenance, space reservations, and supplies."
        actions={
          manage ? (
            <div className="flex gap-2">
              <ButtonLink href={`/c/${slug}/housing/rooms`} variant="secondary">Rooms</ButtonLink>
              <ButtonLink href={`/c/${slug}/housing/manage`} variant="secondary">Manage housing</ButtonLink>
            </div>
          ) : null
        }
      />
      <StatGrid className="mb-8">
        <Stat label="My pending chores" value={pendingChores.length} tone={pendingChores.some((c) => c.due_on < today) ? "warning" : undefined} hint={pendingChores.some((c) => c.due_on < today) ? "Some are past due" : undefined} />
        <Stat label="My open maintenance requests" value={myRequests.filter((m) => m.status === "open" || m.status === "in_progress").length} />
        <Stat label="Assigned maintenance" value={assignedToMe.length} />
        <Stat label="Upcoming reservations" value={reservations.filter((r) => r.user_id === user.id).length} hint="Made by you" />
      </StatGrid>
      {manage && rooms.length === 0 ? (
        <Notice
          tone="info"
          title="Set up the rooms in your house"
          className="mb-8"
          action={<ButtonLink href={`/c/${slug}/housing/rooms/new`} size="sm">Add rooms</ButtonLink>}
        >
          Add every bedroom in one go with numbering like 101, 102, 201, then assign who lives where.
        </Notice>
      ) : null}
      {typeof errorParam === "string" ? <Notice tone="danger" className="mb-8">{errorParam}</Notice> : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          {rooms.length || mine.length ? (
            <Card>
              <CardHeader title="Your room" />
              {home && homeRoom ? (
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-2xl font-semibold tracking-tight text-ink">{homeRoom.name}</p>
                      <p className="mt-0.5 text-[13px] text-ink-3">
                        {[homeRoom.floor, home.bed_label ? `Bed ${home.bed_label}` : null, `Since ${formatDate(home.starts_on, "UTC")}`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="text-right">
                      {homeRoom.rent_cents ? <p className="text-sm font-medium text-ink tnum">{formatCents(Number(homeRoom.rent_cents))} rent</p> : null}
                      <p className={home.ends_on ? "text-[12px] text-warning" : "text-[12px] text-ink-3"}>{home.ends_on ? `Move out ${formatDate(home.ends_on, "UTC")}` : "No move-out date"}</p>
                    </div>
                  </div>
                  {homeRoom.features.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {homeRoom.features.map((f) => <Badge key={f}>{f}</Badge>)}
                    </div>
                  ) : null}
                  <div className="rounded-lg border border-line bg-canvas px-4 py-3">
                    <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">Roommates</p>
                    <p className="mt-1 text-sm text-ink-2">
                      {roommates.length ? roommates.map((r) => `${nameOf.get(r.membership_id) ?? "Member"}${r.bed_label ? ` (bed ${r.bed_label})` : ""}`).join(", ") : "Just you for now"}
                    </p>
                  </div>
                  {next ? <p className="text-[13px] text-ink-2">Moving to {roomById.get(next.room_id)?.name ?? "a new room"} on {formatDate(next.starts_on, "UTC")}.</p> : null}
                </CardBody>
              ) : next ? (
                <CardBody>
                  <p className="text-sm text-ink">You move into <span className="font-semibold">{roomById.get(next.room_id)?.name ?? "your room"}</span> on {formatDate(next.starts_on, "UTC")}.</p>
                </CardBody>
              ) : (
                <EmptyState icon={BedDouble} title="You do not have a room">Want to live in? Send a housing request with the form on this page.</EmptyState>
              )}
            </Card>
          ) : null}

          {rooms.length ? (
            <Card>
              <CardHeader title="Who lives where" description={`${assignments.filter((a) => isCurrent(a, today)).length} members living in`} />
              <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
                {rooms.map((r) => {
                  const here = assignments.filter((a) => a.room_id === r.id && isCurrent(a, today));
                  return (
                    <li key={r.id} className={cx("flex items-start justify-between gap-3 px-5 py-3 sm:border-b sm:border-line", home?.room_id === r.id && "bg-accent/5")}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{r.name}</p>
                        <p className="truncate text-[12px] text-ink-3">{here.length ? here.map((a) => nameOf.get(a.membership_id) ?? "Member").join(", ") : "Open"}</p>
                      </div>
                      <span className="shrink-0 text-[12px] text-ink-3 tnum">{here.length}/{r.capacity}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="My chores" />
            {chores.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No chores assigned">Chores assigned by your house manager will appear here.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {chores.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className={c.status === "done" ? "text-sm text-ink-3 line-through" : "text-sm font-medium text-ink"}>{c.title}</p>
                      <p className={c.status === "pending" && c.due_on < today ? "text-[12px] text-danger" : "text-[12px] text-ink-3"}>
                        Due {formatDate(c.due_on, "UTC")}
                        {c.status === "pending" && c.due_on < today ? " · past due" : ""}
                      </p>
                    </div>
                    {c.status === "missed" ? (
                      <Badge tone="danger">Missed</Badge>
                    ) : c.status === "done" ? (
                      <Badge tone="positive">Done</Badge>
                    ) : (
                      <form action={completeChore.bind(null, slug, c.id, true)}>
                        <SubmitButton size="sm" variant="secondary">Mark done</SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {assignedToMe.length ? (
            <Card>
              <CardHeader title="Maintenance assigned to me" />
              <ul className="divide-y divide-line">
                {assignedToMe.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{m.title}</p>
                      <p className="text-[12px] text-ink-3">{[m.location, formatDate(m.created_at, chapter.timezone)].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge tone={PRIORITY[m.priority].tone}>{PRIORITY[m.priority].label}</Badge>
                      <Badge tone={MAINTENANCE_STATUS[m.status].tone}>{MAINTENANCE_STATUS[m.status].label}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Upcoming reservations" />
            {reservations.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nothing reserved">{reservable.length ? "Reserve a space with the form on this page." : "No spaces are open for reservations yet."}</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {reservations.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{facilityName.get(r.facility_id) ?? "Space"}</p>
                      <p className="text-[12px] text-ink-3">
                        {formatDateTime(r.starts_at, chapter.timezone)} to {formatTime(r.ends_at, chapter.timezone)}
                        {r.purpose ? ` · ${r.purpose}` : ""}
                      </p>
                    </div>
                    {r.user_id === user.id || manage ? (
                      <form action={cancelReservation.bind(null, slug, r.id)}>
                        <SubmitButton size="sm" variant="ghost">Cancel</SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="My maintenance requests" />
            {myRequests.length === 0 ? (
              <EmptyState icon={Wrench} title="No requests">Report a problem with the form on this page.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {myRequests.map((m) => (
                  <li key={m.id} className="space-y-1 px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ink">{m.title}</p>
                      <Badge tone={MAINTENANCE_STATUS[m.status].tone}>{MAINTENANCE_STATUS[m.status].label}</Badge>
                    </div>
                    <p className="text-[12px] text-ink-3">Submitted {formatDate(m.created_at, chapter.timezone)}</p>
                    {m.resolution_note ? <p className="text-[13px] text-ink-2">{m.resolution_note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {supplies.length ? (
            <Card>
              <CardHeader title="My supply requests" />
              <ul className="divide-y divide-line">
                {supplies.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <p className="text-sm text-ink">
                      {s.item_name} <span className="text-ink-3 tnum">× {s.quantity}</span>
                    </p>
                    <Badge tone={SUPPLY_STATUS[s.status].tone}>{SUPPLY_STATUS[s.status].label}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-8">
          {rooms.length ? (
            <Card>
              <CardHeader title="Request housing" description="Ask for a room and roommates for an upcoming term." />
              <CardBody className="space-y-4">
                {housingRequests.length ? (
                  <ul className="space-y-2">
                    {housingRequests.map((q) => (
                      <li key={q.id} className="rounded-lg border border-line px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-ink">{q.term_label}</span>
                          <Badge tone={REQUEST_STATUS[q.status].tone}>{REQUEST_STATUS[q.status].label}</Badge>
                        </div>
                        {q.response ? <p className="mt-1 text-[13px] text-ink-2">{q.response}</p> : null}
                        <form action={deleteHousingRequest.bind(null, slug, q.id)} className="mt-1">
                          <ConfirmSubmit message="Delete this housing request?" variant="ghost">Delete</ConfirmSubmit>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {home || next ? (
                  <Notice title="You already have a room">A housing request is for members who are not assigned. Ask the house manager if you need to move.</Notice>
                ) : (
                  <SimpleForm
                    action={submitHousingRequest.bind(null, slug)}
                    submitLabel="Send request"
                    fields={[
                      { name: "term", label: "Term", placeholder: "Fall 2027", maxLength: 40, hint: "Sending again for the same term updates your request." },
                      { name: "room_1", label: "First choice", type: "select", options: roomOptions, span: "half" },
                      { name: "room_2", label: "Second choice", type: "select", options: roomOptions, span: "half" },
                      { name: "roommate_1", label: "Roommate", type: "select", options: mateOptions, span: "half" },
                      { name: "roommate_2", label: "Another roommate", type: "select", options: mateOptions, span: "half" },
                      { name: "single", label: "I would prefer a single", type: "checkbox" },
                      { name: "notes", label: "Anything else", type: "textarea", maxLength: 1000 },
                    ]}
                  />
                )}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Report a problem" />
            <CardBody>
              <SimpleForm
                action={submitMaintenance.bind(null, slug)}
                submitLabel="Submit request"
                fields={[
                  { name: "title", label: "What is wrong?", maxLength: 140 },
                  ...(facilities.length ? [{ name: "facility_id", label: "Space", type: "select" as const, options: [{ value: "", label: "Not specific" }, ...facilities.map((f) => ({ value: f.id, label: f.name }))], span: "half" as const }] : []),
                  { name: "location", label: "Location", placeholder: "Room 204", maxLength: 120, span: facilities.length ? "half" : "full" },
                  {
                    name: "priority",
                    label: "Priority",
                    type: "select",
                    defaultValue: "normal",
                    options: Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label })),
                    hint: "For emergencies, contact campus facilities or 911 first.",
                  },
                  { name: "description", label: "Details", type: "textarea", maxLength: 2000 },
                ]}
              />
            </CardBody>
          </Card>

          {reservable.length ? (
            <Card>
              <CardHeader title="Reserve a space" description="Up to 24 hours per reservation." />
              <CardBody>
                <SimpleForm
                  action={reserveFacility.bind(null, slug)}
                  submitLabel="Reserve"
                  pendingLabel="Reserving"
                  fields={[
                    { name: "facility_id", label: "Space", type: "select", options: reservable.map((f) => ({ value: f.id, label: f.name })) },
                    { name: "date", label: "Date", type: "date", min: today, defaultValue: today },
                    { name: "start", label: "From", type: "time", span: "half" },
                    { name: "end", label: "Until", type: "time", span: "half" },
                    { name: "purpose", label: "Purpose", maxLength: 200 },
                  ]}
                />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Request supplies" />
            <CardBody>
              <SimpleForm
                action={requestSupply.bind(null, slug)}
                submitLabel="Send request"
                fields={[
                  { name: "item_name", label: "Item", maxLength: 120, span: "half" },
                  { name: "quantity", label: "Quantity", type: "number", min: "1", max: "1000", defaultValue: "1", span: "half" },
                  { name: "note", label: "Note", type: "textarea", maxLength: 500 },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
