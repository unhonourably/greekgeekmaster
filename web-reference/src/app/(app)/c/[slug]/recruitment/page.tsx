import Link from "next/link";
import { BellRing, Search, UserPlus } from "lucide-react";
import { Badge, Button, ButtonLink, Card, EmptyState, Input, PageHeader, Select, Stat, StatGrid, buttonClass, cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTime } from "@/lib/format";
import { OUTCOME_TONE, PROSPECT_COLUMNS, type Prospect } from "@/lib/recruitment";
import { setupPipeline } from "./actions";
import { loadStages, memberNames, requireRecruitment } from "./data";

export default async function RecruitmentPage({ params, searchParams }: PageProps<"/c/[slug]/recruitment">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { chapter, membership, can } = await requireRecruitment(slug);
  const canManage = can("recruitment.manage");
  const stages = await loadStages(chapter.id);
  const base = `/c/${slug}/recruitment`;

  if (!stages.length) {
    return (
      <>
        <PageHeader title="Recruitment" />
        <Card>
          <EmptyState icon={UserPlus} title="The pipeline is not set up">
            {canManage ? (
              <form action={setupPipeline.bind(null, slug)} className="mt-2">
                <p className="mb-3">Start with six standard stages. You can rename, reorder, or add stages afterward.</p>
                <Button type="submit">Set up pipeline</Button>
              </form>
            ) : (
              "Ask the recruitment chair to set up the pipeline."
            )}
          </EmptyState>
        </Card>
      </>
    );
  }

  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const owner = sp.owner === "me" ? "me" : sp.owner === "none" ? "none" : "";
  const archived = sp.view === "archived";
  const supabase = await createClient();
  let query = supabase.from("prospects").select(PROSPECT_COLUMNS).eq("chapter_id", chapter.id).eq("status", archived ? "archived" : "active");
  if (q) query = query.or(`full_name.ilike.%${q.replace(/[%,()_\\]/g, "")}%,preferred_name.ilike.%${q.replace(/[%,()_\\]/g, "")}%`);
  if (owner === "me") query = query.eq("owner_membership_id", membership.id);
  if (owner === "none") query = query.is("owner_membership_id", null);
  const { data } = await query.order("updated_at", { ascending: false }).limit(500);
  const prospects = (data ?? []) as Prospect[];
  const owners = await memberNames(chapter.id, prospects.map((p) => p.owner_membership_id ?? ""));
  const now = requestTime();
  const byStage = new Map(stages.map((s) => [s.id, [] as Prospect[]]));
  for (const p of prospects) byStage.get(p.stage_id)?.push(p);
  const outcomeOf = new Map(stages.map((s) => [s.id, s.outcome]));
  const dueCount = prospects.filter((p) => p.next_follow_up_at && new Date(p.next_follow_up_at).getTime() <= now).length;
  const offered = prospects.filter((p) => outcomeOf.get(p.stage_id) === "offered").length;
  const joined = prospects.filter((p) => outcomeOf.get(p.stage_id) === "joined").length;

  return (
    <>
      <PageHeader
        title="Recruitment"
        description="Prospect records are visible only to members with recruitment access. Platform staff cannot read them."
        actions={
          <>
            {canManage ? <ButtonLink href={`${base}/stages`} variant="secondary" size="sm">Stages</ButtonLink> : null}
            <ButtonLink href={`${base}/new`} size="sm">Add prospect</ButtonLink>
          </>
        }
      />
      {!archived ? (
        <StatGrid className="mb-6">
          <Stat label="Active prospects" value={prospects.length} />
          <Stat label="Follow-ups due" value={dueCount} tone={dueCount ? "warning" : undefined} />
          <Stat label="Offers out" value={offered} />
          <Stat label="Joined" value={joined} tone={joined ? "positive" : undefined} />
        </StatGrid>
      ) : null}
      <form action={base} className="mb-5 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Search prospects" className="pl-8" aria-label="Search prospects" />
        </div>
        <Select name="owner" defaultValue={owner} aria-label="Recruiter" className="w-44">
          <option value="">All recruiters</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
        </Select>
        <Select name="view" defaultValue={archived ? "archived" : ""} aria-label="Status" className="w-36">
          <option value="">Active</option>
          <option value="archived">Archived</option>
        </Select>
        <button type="submit" className={buttonClass("secondary")}>Filter</button>
      </form>
      {archived ? (
        prospects.length === 0 ? (
          <Card>
            <EmptyState icon={UserPlus} title="No archived prospects" />
          </Card>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {prospects.map((p) => (
              <li key={p.id}>
                <Link href={`${base}/${p.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-canvas/50">
                  <span className="font-medium text-ink">{p.full_name}</span>
                  <span className="text-[13px] text-ink-3">{stages.find((s) => s.id === p.stage_id)?.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8">
          <div className="flex min-w-max gap-3">
            {stages.map((s) => {
              const items = byStage.get(s.id) ?? [];
              return (
                <section key={s.id} className="w-64 shrink-0 rounded-lg border border-line bg-canvas/60">
                  <header className="flex items-center justify-between border-b border-line px-3 py-2">
                    <h2 className="truncate text-[13px] font-semibold text-ink">{s.name}</h2>
                    <Badge tone={OUTCOME_TONE[s.outcome]}>{items.length}</Badge>
                  </header>
                  <ul className="space-y-2 p-2">
                    {items.length === 0 ? <li className="px-1 py-3 text-center text-[12px] text-ink-3">Empty</li> : null}
                    {items.map((p) => {
                      const due = p.next_follow_up_at && new Date(p.next_follow_up_at).getTime() <= now;
                      return (
                        <li key={p.id}>
                          <Link href={`${base}/${p.id}`} className="block rounded-md border border-line bg-surface px-3 py-2 hover:border-ink-3/40">
                            <span className="block truncate text-sm font-medium text-ink">{p.preferred_name ? `${p.preferred_name} (${p.full_name})` : p.full_name}</span>
                            <span className="block truncate text-[12px] text-ink-3">
                              {[p.class_year, p.major].filter(Boolean).join(" · ") || "No details yet"}
                            </span>
                            <span className="mt-1.5 flex items-center justify-between gap-2 text-[12px]">
                              <span className="truncate text-ink-3">{p.owner_membership_id ? owners.get(p.owner_membership_id) : "Unassigned"}</span>
                              {p.next_follow_up_at ? (
                                <span className={cx("flex shrink-0 items-center gap-1", due ? "text-warning" : "text-ink-3")}>
                                  <BellRing className="size-3" aria-hidden />
                                  {formatDate(p.next_follow_up_at, chapter.timezone).replace(/, \d{4}$/, "")}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
