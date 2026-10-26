import { BookOpen, Target, Users } from "lucide-react";
import { personName } from "@/components/people";
import { SimpleForm } from "@/components/simple-form";
import { SubmitButton } from "@/components/forms";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTime } from "@/lib/format";
import { activeMembers, requireModule, todayIn } from "@/lib/modules";
import { addGoal, createMentorship, createStudyGroup, deleteGoal, endMentorship, toggleStudyGroup, updateGoal } from "./actions";

type Group = { id: string; name: string; course_code: string | null; meeting_info: string | null; description: string | null; created_by: string };
type Goal = { id: string; title: string; target_date: string | null; status: "active" | "achieved" | "dropped"; share_with_scholarship: boolean; user_id: string };
type Pair = { id: string; mentor_membership_id: string; mentee_membership_id: string; started_on: string; status: string };

const GOAL_STATUS = { active: { label: "In progress", tone: "info" }, achieved: { label: "Achieved", tone: "positive" }, dropped: { label: "Dropped", tone: "neutral" } } as const;

export default async function AcademicsPage({ params }: PageProps<"/c/[slug]/academics">) {
  const { slug } = await params;
  const { chapter, user, membership, can } = await requireModule(slug, "academics");
  const manage = can("academics.manage");
  const supabase = await createClient();
  const today = todayIn(chapter.timezone, requestTime());

  const [groupsRes, groupMembersRes, goalsRes, pairsRes, members] = await Promise.all([
    supabase.from("study_groups").select("id, name, course_code, meeting_info, description, created_by").eq("chapter_id", chapter.id).order("course_code", { nullsFirst: false }).order("name").limit(200),
    supabase.from("study_group_members").select("group_id, user_id").eq("chapter_id", chapter.id).limit(5000),
    supabase.from("academic_goals").select("id, title, target_date, status, share_with_scholarship, user_id").eq("chapter_id", chapter.id).order("created_at", { ascending: false }).limit(500),
    supabase.from("mentorship_pairs").select("id, mentor_membership_id, mentee_membership_id, started_on, status").eq("chapter_id", chapter.id).eq("status", "active").order("started_on", { ascending: false }).limit(500),
    activeMembers(chapter.id),
  ]);
  const groups = (groupsRes.data ?? []) as Group[];
  const counts = new Map<string, number>();
  const joined = new Set<string>();
  for (const m of groupMembersRes.data ?? []) {
    counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
    if (m.user_id === user.id) joined.add(m.group_id);
  }
  const goals = (goalsRes.data ?? []) as Goal[];
  const myGoals = goals.filter((g) => g.user_id === user.id);
  const sharedGoals = manage ? goals.filter((g) => g.user_id !== user.id && g.share_with_scholarship) : [];
  const pairs = (pairsRes.data ?? []) as Pair[];
  const myPairs = pairs.filter((p) => p.mentor_membership_id === membership.id || p.mentee_membership_id === membership.id);
  const name = new Map(members.map((m) => [m.id, m.name]));
  const nameByUser = new Map(members.map((m) => [m.userId, m.name]));
  const memberOptions = members.map((m) => ({ value: m.id, label: m.name }));
  const { data: me } = await supabase.from("profiles").select("display_name, full_name").eq("id", user.id).maybeSingle();
  const myName = me ? personName(me) : "You";

  return (
    <>
      <PageHeader title="Academics" description="Study groups, mentorship, and personal academic goals. Grades are never collected here." />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <Card>
            <CardHeader title="Study groups" />
            {groups.length === 0 ? (
              <EmptyState icon={BookOpen} title="No study groups yet">Start one for a course you are taking.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {groups.map((g) => {
                  const isIn = joined.has(g.id);
                  return (
                    <li key={g.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {g.course_code ? <Badge tone="accent">{g.course_code}</Badge> : null}
                          <p className="text-sm font-medium text-ink">{g.name}</p>
                        </div>
                        <p className="text-[12px] text-ink-3">
                          {[`${counts.get(g.id) ?? 0} members`, g.meeting_info, g.created_by === user.id ? "Started by you" : nameByUser.get(g.created_by) ? `Started by ${nameByUser.get(g.created_by)}` : null].filter(Boolean).join(" · ")}
                        </p>
                        {g.description ? <p className="mt-1 max-w-xl text-[13px] text-ink-2">{g.description}</p> : null}
                      </div>
                      <form action={toggleStudyGroup.bind(null, slug, g.id, !isIn)}>
                        <SubmitButton size="sm" variant={isIn ? "ghost" : "secondary"}>{isIn ? "Leave" : "Join"}</SubmitButton>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="My goals" description="Private to you unless you choose to share a goal with the scholarship chair." />
            {myGoals.length === 0 ? (
              <EmptyState icon={Target} title="No goals yet">Add a goal with the form on this page.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {myGoals.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className={g.status === "dropped" ? "text-sm text-ink-3 line-through" : "text-sm font-medium text-ink"}>{g.title}</p>
                      <p className={g.status === "active" && g.target_date && g.target_date < today ? "text-[12px] text-warning" : "text-[12px] text-ink-3"}>
                        {[g.target_date ? `Target ${formatDate(g.target_date, "UTC")}` : "No target date", g.share_with_scholarship ? "Shared with scholarship chair" : "Private"].join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge tone={GOAL_STATUS[g.status].tone}>{GOAL_STATUS[g.status].label}</Badge>
                      {g.status === "active" ? (
                        <form action={updateGoal.bind(null, slug, g.id, { status: "achieved" })}>
                          <Button type="submit" size="sm" variant="ghost">Mark achieved</Button>
                        </form>
                      ) : (
                        <form action={updateGoal.bind(null, slug, g.id, { status: "active" })}>
                          <Button type="submit" size="sm" variant="ghost">Reopen</Button>
                        </form>
                      )}
                      <form action={updateGoal.bind(null, slug, g.id, { share_with_scholarship: !g.share_with_scholarship })}>
                        <Button type="submit" size="sm" variant="ghost">{g.share_with_scholarship ? "Make private" : "Share"}</Button>
                      </form>
                      <form action={deleteGoal.bind(null, slug, g.id)}>
                        <Button type="submit" size="sm" variant="ghost">Delete</Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {manage ? (
            <Card>
              <CardHeader title="Goals shared with you" description="Members chose to share these. They can make them private at any time." />
              {sharedGoals.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-ink-3">No members have shared goals yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {sharedGoals.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-ink">{g.title}</p>
                        <p className="text-[12px] text-ink-3">
                          {nameByUser.get(g.user_id) ?? "Member"}
                          {g.target_date ? ` · target ${formatDate(g.target_date, "UTC")}` : ""}
                        </p>
                      </div>
                      <Badge tone={GOAL_STATUS[g.status].tone}>{GOAL_STATUS[g.status].label}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          <Card>
            <CardHeader title={manage ? "Mentorship pairs" : "My mentorship"} />
            {(manage ? pairs : myPairs).length === 0 ? (
              <EmptyState icon={Users} title="No active pairs">{manage ? "Pair a mentor and mentee with the form on this page." : "Your scholarship chair can pair you with a mentor."}</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {(manage ? pairs : myPairs).map((p) => {
                  const mentor = p.mentor_membership_id === membership.id ? myName : (name.get(p.mentor_membership_id) ?? "Member");
                  const mentee = p.mentee_membership_id === membership.id ? myName : (name.get(p.mentee_membership_id) ?? "Member");
                  return (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div>
                        <p className="text-sm text-ink">
                          <span className="font-medium">{mentor}</span> <span className="text-ink-3">mentoring</span> <span className="font-medium">{mentee}</span>
                        </p>
                        <p className="text-[12px] text-ink-3">Since {formatDate(p.started_on, "UTC")}</p>
                      </div>
                      {manage ? (
                        <form action={endMentorship.bind(null, slug, p.id)}>
                          <Button type="submit" size="sm" variant="ghost">End pairing</Button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader title="Add a goal" />
            <CardBody>
              <SimpleForm
                action={addGoal.bind(null, slug)}
                submitLabel="Add goal"
                fields={[
                  { name: "title", label: "Goal", placeholder: "Meet with my advisor before registration", maxLength: 160 },
                  { name: "target_date", label: "Target date", type: "date", min: today },
                  { name: "share_with_scholarship", label: "Share with the scholarship chair", type: "checkbox" },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Start a study group" />
            <CardBody>
              <SimpleForm
                action={createStudyGroup.bind(null, slug)}
                submitLabel="Create group"
                fields={[
                  { name: "course_code", label: "Course", placeholder: "CHEM 201", maxLength: 24, span: "half" },
                  { name: "name", label: "Group name", maxLength: 100, span: "half" },
                  { name: "meeting_info", label: "When and where", placeholder: "Tuesdays 7pm, library room 3", maxLength: 200 },
                  { name: "description", label: "Description", type: "textarea", maxLength: 1000 },
                ]}
              />
            </CardBody>
          </Card>
          {manage ? (
            <Card>
              <CardHeader title="Pair a mentor" />
              <CardBody>
                {memberOptions.length < 2 ? (
                  <p className="text-[13px] text-ink-3">At least two active members are needed.</p>
                ) : (
                  <SimpleForm
                    action={createMentorship.bind(null, slug)}
                    submitLabel="Create pair"
                    fields={[
                      { name: "mentor_membership_id", label: "Mentor", type: "select", options: memberOptions },
                      { name: "mentee_membership_id", label: "Mentee", type: "select", options: memberOptions },
                    ]}
                  />
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
