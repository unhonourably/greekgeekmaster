import { Clock, HandHeart, HeartHandshake } from "lucide-react";
import { personName } from "@/components/people";
import { SimpleForm } from "@/components/simple-form";
import { SubmitButton } from "@/components/forms";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Money, PageHeader, Stat, StatGrid, Table, Td, Th, Tr } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatTime, requestTime } from "@/lib/format";
import { requireModule, todayIn } from "@/lib/modules";
import { addVolunteerShift, deleteShift, logServiceHours, recordDonation, reviewServiceHours, saveCampaign, setCampaignStatus, toggleShift } from "./actions";

type HoursRow = { id: string; organization: string; description: string | null; hours: number; served_on: string; status: "submitted" | "approved" | "rejected"; user_id: string };
type Campaign = { id: string; name: string; beneficiary: string; description: string | null; goal_cents: number | null; starts_on: string | null; ends_on: string | null; status: "draft" | "active" | "closed" };
type Shift = { id: string; name: string; starts_at: string; ends_at: string; slots: number; event: { title: string } | null };

const STATUS_TONE = { submitted: "warning", approved: "positive", rejected: "danger" } as const;
const STATUS_LABEL = { submitted: "Pending review", approved: "Approved", rejected: "Not approved" } as const;
const METHOD_LABEL: Record<string, string> = { cash: "Cash", check: "Check", external_platform: "External platform", other: "Other" };

function hoursLabel(n: number): string {
  return `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })} h`;
}

export default async function PhilanthropyPage({ params }: PageProps<"/c/[slug]/philanthropy">) {
  const { slug } = await params;
  const { chapter, user, can } = await requireModule(slug, "philanthropy");
  const manage = can("philanthropy.manage");
  const supabase = await createClient();
  const now = requestTime();
  const nowIso = new Date(now).toISOString();
  const today = todayIn(chapter.timezone, now);
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const [mine, campaignsRes, progressRes, shiftsRes] = await Promise.all([
    supabase.from("service_hours").select("id, organization, description, hours, served_on, status, user_id").eq("chapter_id", chapter.id).eq("user_id", user.id).order("served_on", { ascending: false }).limit(50),
    supabase.from("fundraising_campaigns").select("id, name, beneficiary, description, goal_cents, starts_on, ends_on, status").eq("chapter_id", chapter.id).order("created_at", { ascending: false }).limit(30),
    supabase.rpc("campaign_progress", { p_chapter: chapter.id }),
    supabase.from("volunteer_shifts").select("id, name, starts_at, ends_at, slots, event:events(title)").eq("chapter_id", chapter.id).gt("ends_at", nowIso).order("starts_at").limit(40),
  ]);
  const myHours = (mine.data ?? []) as HoursRow[];
  const campaigns = ((campaignsRes.data ?? []) as Campaign[]).filter((c) => manage || c.status !== "draft");
  const progress = new Map(((progressRes.data ?? []) as Array<{ campaign_id: string; raised_cents: number; donation_count: number }>).map((p) => [p.campaign_id, p]));
  const shifts = (shiftsRes.data ?? []) as unknown as Shift[];

  const signupCounts = new Map<string, number>();
  const mySignups = new Set<string>();
  if (shifts.length) {
    const { data } = await supabase.from("volunteer_signups").select("shift_id, user_id").in("shift_id", shifts.map((s) => s.id));
    for (const s of data ?? []) {
      signupCounts.set(s.shift_id, (signupCounts.get(s.shift_id) ?? 0) + 1);
      if (s.user_id === user.id) mySignups.add(s.shift_id);
    }
  }

  const myApproved = myHours.filter((h) => h.status === "approved" && h.served_on >= yearStart).reduce((t, h) => t + Number(h.hours), 0);
  const myPending = myHours.filter((h) => h.status === "submitted").reduce((t, h) => t + Number(h.hours), 0);

  let pending: Array<HoursRow & { profile: { display_name: string | null; full_name: string | null } | null }> = [];
  let chapterApproved = 0;
  let events: Array<{ id: string; title: string; starts_at: string }> = [];
  let donations: Array<{ id: string; amount_cents: number; donor_name: string | null; method: string; received_on: string; campaign_id: string }> = [];
  if (manage) {
    const [p, a, e, d] = await Promise.all([
      supabase.from("service_hours").select("id, organization, description, hours, served_on, status, user_id, profile:profiles!service_hours_user_id_fkey(display_name, full_name)").eq("chapter_id", chapter.id).eq("status", "submitted").order("created_at").limit(100),
      supabase.from("service_hours").select("hours").eq("chapter_id", chapter.id).eq("status", "approved").gte("served_on", yearStart).limit(10000),
      supabase.from("events").select("id, title, starts_at").eq("chapter_id", chapter.id).is("cancelled_at", null).gt("ends_at", nowIso).order("starts_at").limit(50),
      supabase.from("donations").select("id, amount_cents, donor_name, method, received_on, campaign_id").eq("chapter_id", chapter.id).order("received_on", { ascending: false }).limit(20),
    ]);
    pending = (p.data ?? []) as unknown as typeof pending;
    chapterApproved = (a.data ?? []).reduce((t, r) => t + Number(r.hours), 0);
    events = e.data ?? [];
    donations = d.data ?? [];
  }
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const openCampaigns = campaigns.filter((c) => c.status === "active");

  return (
    <>
      <PageHeader title="Philanthropy" description="Service hours, volunteer shifts, and fundraising campaigns." />
      <StatGrid className="mb-8">
        <Stat label={`My approved hours, ${today.slice(0, 4)}`} value={hoursLabel(myApproved)} />
        <Stat label="My hours pending review" value={hoursLabel(myPending)} />
        {manage ? <Stat label={`Chapter approved hours, ${today.slice(0, 4)}`} value={hoursLabel(chapterApproved)} /> : null}
        {manage ? <Stat label="Submissions to review" value={pending.length} tone={pending.length ? "warning" : undefined} /> : null}
      </StatGrid>

      {manage && pending.length ? (
        <Card className="mb-8">
          <CardHeader title="Review service hours" description="You cannot approve your own submissions." />
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Organization</Th>
                  <Th>Date</Th>
                  <Th align="right">Hours</Th>
                  <Th align="right">Decision</Th>
                </tr>
              </thead>
              <tbody>
                {pending.map((h) => (
                  <Tr key={h.id}>
                    <Td>{h.profile ? personName(h.profile) : "Member"}</Td>
                    <Td>
                      <p className="text-ink">{h.organization}</p>
                      {h.description ? <p className="max-w-md text-[12px] text-ink-3">{h.description}</p> : null}
                    </Td>
                    <Td>{formatDate(h.served_on, "UTC")}</Td>
                    <Td align="right" className="tnum">{hoursLabel(h.hours)}</Td>
                    <Td align="right">
                      {h.user_id === user.id ? (
                        <span className="text-[12px] text-ink-3">Another officer must review</span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <form action={reviewServiceHours.bind(null, slug, h.id, "rejected")}>
                            <SubmitButton size="sm" variant="ghost">Reject</SubmitButton>
                          </form>
                          <form action={reviewServiceHours.bind(null, slug, h.id, "approved")}>
                            <SubmitButton size="sm" variant="secondary">Approve</SubmitButton>
                          </form>
                        </div>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <Card>
            <CardHeader title="Volunteer shifts" description="Sign up for upcoming shifts. You can leave a shift until it starts." />
            {shifts.length === 0 ? (
              <EmptyState icon={HandHeart} title="No upcoming shifts">
                {manage ? "Add shifts to an upcoming event below." : "Shifts posted by officers will appear here."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {shifts.map((s) => {
                  const taken = signupCounts.get(s.id) ?? 0;
                  const joined = mySignups.has(s.id);
                  const started = new Date(s.starts_at).getTime() <= now;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{s.name}</p>
                        <p className="text-[12px] text-ink-3">
                          {s.event?.title ?? "Event"} · {formatDateTime(s.starts_at, chapter.timezone)} to {formatTime(s.ends_at, chapter.timezone)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[13px] text-ink-3 tnum">
                          {taken} of {s.slots} filled
                        </span>
                        {started ? (
                          <Badge>In progress</Badge>
                        ) : joined ? (
                          <form action={toggleShift.bind(null, slug, s.id, false)}>
                            <SubmitButton size="sm" variant="ghost">Leave</SubmitButton>
                          </form>
                        ) : taken >= s.slots ? (
                          <Badge>Full</Badge>
                        ) : (
                          <form action={toggleShift.bind(null, slug, s.id, true)}>
                            <SubmitButton size="sm" variant="secondary">Sign up</SubmitButton>
                          </form>
                        )}
                        {manage && taken === 0 && !started ? (
                          <form action={deleteShift.bind(null, slug, s.id)}>
                            <Button type="submit" size="sm" variant="ghost">Remove</Button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Campaigns" description={manage ? "Donations are recorded by officers. GreekGeek does not process donation payments." : undefined} />
            {campaigns.length === 0 ? (
              <EmptyState icon={HeartHandshake} title="No campaigns yet">
                {manage ? "Create a campaign to start tracking donations toward a goal." : "Fundraising campaigns will appear here."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {campaigns.map((c) => {
                  const p = progress.get(c.id);
                  const raised = Number(p?.raised_cents ?? 0);
                  const pct = c.goal_cents ? Math.min(100, Math.round((raised / c.goal_cents) * 100)) : null;
                  return (
                    <li key={c.id} className="space-y-2 px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-ink">{c.name}</p>
                            {c.status === "closed" ? <Badge>Closed</Badge> : c.status === "draft" ? <Badge tone="info">Draft</Badge> : null}
                          </div>
                          <p className="text-[12px] text-ink-3">
                            For {c.beneficiary}
                            {c.starts_on || c.ends_on ? ` · ${c.starts_on ? formatDate(c.starts_on, "UTC") : "Open"} to ${c.ends_on ? formatDate(c.ends_on, "UTC") : "open"}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-ink">
                            <Money cents={raised} currency={chapter.currency} />
                            {c.goal_cents ? (
                              <span className="font-normal text-ink-3">
                                {" "}
                                of <Money cents={c.goal_cents} currency={chapter.currency} />
                              </span>
                            ) : null}
                          </p>
                          <p className="text-[12px] text-ink-3 tnum">{Number(p?.donation_count ?? 0)} donations</p>
                        </div>
                      </div>
                      {pct !== null ? (
                        <div className="h-1.5 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.name} progress`}>
                          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                      ) : null}
                      {c.description ? <p className="text-[13px] text-ink-2">{c.description}</p> : null}
                      {manage ? (
                        <form action={setCampaignStatus.bind(null, slug, c.id, c.status === "closed" ? "active" : "closed")} className="flex justify-end">
                          <Button type="submit" size="sm" variant="ghost">{c.status === "closed" ? "Reopen" : "Close campaign"}</Button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {manage && donations.length ? (
            <Card>
              <CardHeader title="Recent donations" />
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Received</Th>
                      <Th>Campaign</Th>
                      <Th>Donor</Th>
                      <Th>Method</Th>
                      <Th align="right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {donations.map((d) => (
                      <Tr key={d.id}>
                        <Td>{formatDate(d.received_on, "UTC")}</Td>
                        <Td>{campaignName.get(d.campaign_id) ?? "Campaign"}</Td>
                        <Td>{d.donor_name ?? "Anonymous"}</Td>
                        <Td>{METHOD_LABEL[d.method] ?? d.method}</Td>
                        <Td align="right">
                          <Money cents={d.amount_cents} currency={chapter.currency} />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="My service hours" />
            {myHours.length === 0 ? (
              <EmptyState icon={Clock} title="No hours logged">Log service hours with the form on this page.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Organization</Th>
                      <Th align="right">Hours</Th>
                      <Th align="right">Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {myHours.map((h) => (
                      <Tr key={h.id}>
                        <Td>{formatDate(h.served_on, "UTC")}</Td>
                        <Td>{h.organization}</Td>
                        <Td align="right" className="tnum">{hoursLabel(h.hours)}</Td>
                        <Td align="right">
                          <Badge tone={STATUS_TONE[h.status]}>{STATUS_LABEL[h.status]}</Badge>
                        </Td>
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
            <CardHeader title="Log service hours" description="An officer reviews each submission." />
            <CardBody>
              <SimpleForm
                action={logServiceHours.bind(null, slug)}
                submitLabel="Submit hours"
                fields={[
                  { name: "organization", label: "Organization served", maxLength: 120 },
                  { name: "served_on", label: "Date", type: "date", max: today, defaultValue: today, span: "half" },
                  { name: "hours", label: "Hours", type: "number", min: "0.25", max: "24", step: "0.25", span: "half" },
                  { name: "description", label: "What you did", type: "textarea", maxLength: 1000 },
                ]}
              />
            </CardBody>
          </Card>

          {manage ? (
            <>
              <Card>
                <CardHeader title="Add a volunteer shift" />
                <CardBody>
                  {events.length === 0 ? (
                    <p className="text-[13px] text-ink-3">Create an upcoming event first. Shifts are attached to events.</p>
                  ) : (
                    <SimpleForm
                      action={addVolunteerShift.bind(null, slug)}
                      submitLabel="Add shift"
                      fields={[
                        { name: "event_id", label: "Event", type: "select", options: events.map((e) => ({ value: e.id, label: `${e.title} · ${formatDate(e.starts_at, chapter.timezone)}` })) },
                        { name: "name", label: "Shift name", placeholder: "Setup crew", maxLength: 80 },
                        { name: "date", label: "Date", type: "date", min: today, span: "half" },
                        { name: "slots", label: "Volunteers needed", type: "number", min: "1", max: "500", span: "half" },
                        { name: "start", label: "Starts", type: "time", span: "half" },
                        { name: "end", label: "Ends", type: "time", span: "half" },
                      ]}
                    />
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Record a donation" description="For money received by cash, check, or another platform." />
                <CardBody>
                  {openCampaigns.length === 0 ? (
                    <p className="text-[13px] text-ink-3">Create an active campaign to record donations.</p>
                  ) : (
                    <SimpleForm
                      action={recordDonation.bind(null, slug)}
                      submitLabel="Record donation"
                      fields={[
                        { name: "campaign_id", label: "Campaign", type: "select", options: openCampaigns.map((c) => ({ value: c.id, label: c.name })) },
                        { name: "amount", label: "Amount", type: "money", span: "half" },
                        { name: "received_on", label: "Received", type: "date", max: today, defaultValue: today, span: "half" },
                        {
                          name: "method",
                          label: "Method",
                          type: "select",
                          options: Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label })),
                          span: "half",
                        },
                        { name: "reference", label: "Reference", hint: "Check number or platform ID", maxLength: 120, span: "half" },
                        { name: "donor_name", label: "Donor name", hint: "Leave blank for anonymous", maxLength: 120 },
                        { name: "note", label: "Note", type: "textarea", maxLength: 500 },
                      ]}
                    />
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="New campaign" />
                <CardBody>
                  <SimpleForm
                    action={saveCampaign.bind(null, slug)}
                    submitLabel="Create campaign"
                    fields={[
                      { name: "name", label: "Name", maxLength: 120 },
                      { name: "beneficiary", label: "Beneficiary", maxLength: 160 },
                      { name: "goal", label: "Goal", type: "money", hint: "Optional", span: "half" },
                      { name: "starts_on", label: "Starts", type: "date", span: "half" },
                      { name: "ends_on", label: "Ends", type: "date", span: "half" },
                      { name: "description", label: "Description", type: "textarea", maxLength: 2000 },
                    ]}
                  />
                </CardBody>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
