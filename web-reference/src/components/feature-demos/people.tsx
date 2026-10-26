"use client";

import { useState } from "react";
import {
  ArrowLeft,
  AtSign,
  BookOpen,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  CreditCard,
  HandHeart,
  House,
  Landmark,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Pencil,
  Phone,
  Receipt,
  Scale,
  Settings,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Avatar, RoleBadge } from "@/components/people";
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, DefinitionList, Field, Input, Notice, Select, Textarea, buttonClass, cx } from "@/components/ui";
import { AppFrame, MockHeader, SubNavMock, TryIt } from "./shared";

const PERMISSION_ROWS: Array<{ key: string; category: string; description: string; sensitive: boolean }> = [
  { key: "chapter.manage", category: "Chapter", description: "Edit chapter profile, modules, and settings", sensitive: false },
  { key: "chapter.ownership", category: "Chapter", description: "Accept agreements, transfer ownership, and manage administrators", sensitive: true },
  { key: "members.manage", category: "Members", description: "Invite, import, deactivate, and change member status", sensitive: true },
  { key: "roles.manage", category: "Members", description: "Create roles and assign officer positions", sensitive: true },
  { key: "committees.manage", category: "Members", description: "Create committees and manage committee membership", sensitive: false },
  { key: "finance.view", category: "Finance", description: "View all member balances, payments, and financial reports", sensitive: true },
  { key: "finance.manage", category: "Finance", description: "Create assessments, record offline payments, and issue credits", sensitive: true },
  { key: "finance.refund", category: "Finance", description: "Issue refunds for online payments", sensitive: true },
  { key: "payments.configure", category: "Finance", description: "Set up and maintain the chapter payment account", sensitive: true },
  { key: "chat.manage", category: "Communication", description: "Create channels and manage channel membership", sensitive: false },
  { key: "chat.moderate", category: "Communication", description: "Review reports and remove messages in chapter channels", sensitive: true },
  { key: "announcements.publish", category: "Communication", description: "Publish chapter announcements", sensitive: false },
  { key: "announcements.officers", category: "Communication", description: "Read and publish officer-only announcements", sensitive: false },
  { key: "events.manage", category: "Events", description: "Create and edit events", sensitive: false },
  { key: "attendance.view", category: "Events", description: "View attendance records for all members", sensitive: true },
  { key: "attendance.manage", category: "Events", description: "Record and correct attendance", sensitive: true },
  { key: "recruitment.view", category: "Recruitment", description: "View prospects and log recruitment activity", sensitive: true },
  { key: "recruitment.manage", category: "Recruitment", description: "Manage pipeline stages, assignments, and restricted notes", sensitive: true },
  { key: "philanthropy.manage", category: "Philanthropy", description: "Manage campaigns, donations, shifts, and approve service hours", sensitive: false },
  { key: "housing.manage", category: "Housing", description: "Manage rooms, residents, maintenance, chores, and inventory", sensitive: false },
  { key: "standards.view", category: "Standards", description: "View policy acknowledgments and training completion", sensitive: true },
  { key: "standards.manage", category: "Standards", description: "Publish policies and manage confidential incident reports", sensitive: true },
  { key: "academics.manage", category: "Academics", description: "Manage mentorship pairs and view goals members chose to share", sensitive: true },
  { key: "analytics.view", category: "Reporting", description: "View chapter engagement analytics", sensitive: false },
  { key: "audit.view", category: "Reporting", description: "View the chapter audit log", sensitive: true },
];

const TEMPLATES: Array<{ name: string; description: string; tone: string; officer: boolean; holders: number; permissions: string[] }> = [
  { name: "Treasurer", description: "Manages dues, payments, and chapter finances", tone: "green", officer: true, holders: 1, permissions: ["finance.view", "finance.manage", "finance.refund", "payments.configure", "announcements.officers", "analytics.view"] },
  { name: "President", description: "Chief executive officer of the chapter", tone: "gold", officer: true, holders: 1, permissions: ["chapter.manage", "members.manage", "roles.manage", "committees.manage", "finance.view", "chat.manage", "chat.moderate", "announcements.publish", "announcements.officers", "events.manage", "attendance.view", "recruitment.view", "standards.view", "analytics.view", "audit.view"] },
  { name: "Recruitment chair", description: "Leads recruitment strategy and the prospect pipeline", tone: "accent", officer: true, holders: 1, permissions: ["recruitment.view", "recruitment.manage", "events.manage", "announcements.officers"] },
  { name: "Social chair", description: "Plans social programming", tone: "slate", officer: true, holders: 2, permissions: ["events.manage", "announcements.officers"] },
  { name: "Financial auditor", description: "Read-only access to financial records for review", tone: "neutral", officer: false, holders: 0, permissions: ["finance.view", "audit.view"] },
];

const TONES = [["neutral", "Gray"], ["accent", "Accent"], ["gold", "Gold"], ["slate", "Blue"], ["green", "Green"], ["rose", "Red"]] as const;

type NavLine = { label: string; icon: LucideIcon };

function sidebarFor(held: Set<string>): Array<{ label?: string; items: NavLine[] }> {
  const can = (key: string) => held.has(key);
  const home: NavLine[] = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Messages", icon: MessagesSquare },
    { label: "Announcements", icon: Megaphone },
    { label: "Events", icon: CalendarDays },
    { label: "Directory", icon: Users },
    { label: "My dues", icon: CreditCard },
    { label: "Reimbursements", icon: Receipt },
  ];
  if (can("chapter.manage")) home.splice(1, 0, { label: "Setup", icon: ClipboardList });
  const officers: NavLine[] = [];
  if (can("finance.view")) officers.push({ label: "Finances", icon: Wallet });
  if (can("chapter.manage") || can("payments.configure")) officers.push({ label: "Stripe setup", icon: Landmark });
  if (can("recruitment.view") || can("recruitment.manage")) officers.push({ label: "Recruitment", icon: UserPlus });
  if (can("analytics.view")) officers.push({ label: "Analytics", icon: ChartColumn });
  const groups: Array<{ label?: string; items: NavLine[] }> = [{ items: home }];
  if (officers.length) groups.push({ label: "Officers", items: officers });
  groups.push({ label: "Programs", items: [{ label: "Philanthropy", icon: HandHeart }, { label: "Housing", icon: House }, { label: "Standards", icon: Scale }, { label: "Academics", icon: BookOpen }] });
  if (["chapter.manage", "members.manage", "roles.manage", "payments.configure", "audit.view"].some(can)) groups.push({ items: [{ label: "Settings", icon: Settings }] });
  return groups;
}

export function RolesDemo() {
  const [pick, setPick] = useState(0);
  const [held, setHeld] = useState<Set<string>>(() => new Set(TEMPLATES[0].permissions));
  const [name, setName] = useState(TEMPLATES[0].name);
  const [tone, setTone] = useState(TEMPLATES[0].tone);
  const [saved, setSaved] = useState(false);
  const role = TEMPLATES[pick];
  const groups = [...new Set(PERMISSION_ROWS.map((p) => p.category))];
  const sidebar = sidebarFor(held);
  const officerOnly = new Set(sidebar.flatMap((g) => g.items.map((i) => i.label))).size - sidebarFor(new Set()).flatMap((g) => g.items).length;

  function choose(index: number) {
    setPick(index);
    setHeld(new Set(TEMPLATES[index].permissions));
    setName(TEMPLATES[index].name);
    setTone(TEMPLATES[index].tone);
    setSaved(false);
  }

  function toggle(key: string) {
    setHeld((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSaved(false);
  }

  return (
    <div>
      <TryIt>Pick a role and check or uncheck permissions. The sidebar on the right updates to show exactly what someone holding only that role would see.</TryIt>
      <div className="mb-3 flex flex-wrap gap-2">
        {TEMPLATES.map((template, index) => (
          <Button key={template.name} variant={index === pick ? "primary" : "secondary"} size="sm" onClick={() => choose(index)}>{template.name}</Button>
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <AppFrame path={`/settings/roles/${role.name.toLowerCase().replace(/\s+/g, "-")}`} active="settings" onReset={() => choose(0)}>
          <MockHeader title="Settings" />
          <SubNavMock items={["General", "Stripe and billing", "Members and invitations", "Roles", "Audit log"]} active="Roles" />
          <div className="max-w-3xl space-y-4">
            <span className="inline-flex items-center gap-1 text-sm text-ink-2">
              <ArrowLeft className="size-4" aria-hidden />
              All roles
            </span>
            <Card>
              <CardHeader title={role.name} description={`${role.holders} current holder${role.holders === 1 ? "" : "s"}`} />
              <CardBody>
                <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
                  {saved ? <Notice tone="positive">Role saved.</Notice> : null}
                  <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                    <Field label="Name" htmlFor="role-name"><Input id="role-name" value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} maxLength={60} placeholder="Social chair" /></Field>
                    <Field label="Badge color" htmlFor="role-tone">
                      <Select id="role-tone" value={tone} onChange={(event) => { setTone(event.target.value); setSaved(false); }}>
                        {TONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Description" htmlFor="role-description" hint="Optional. Shown to officers when assigning the role.">
                    <Textarea key={pick} id="role-description" defaultValue={role.description} maxLength={300} className="min-h-16" />
                  </Field>
                  <Checkbox key={`officer-${pick}`} defaultChecked={role.officer} label="Officer role" description="Officer roles appear first in the directory and can be mentioned as a group in chat." />
                  <fieldset className="space-y-5">
                    <legend className="text-sm font-medium text-ink">Permissions</legend>
                    {groups.map((category) => (
                      <div key={category}>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">{category}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {PERMISSION_ROWS.filter((p) => p.category === category).map((p) => (
                            <Checkbox key={p.key} checked={held.has(p.key)} onChange={() => toggle(p.key)} label={p.description} description={p.sensitive ? "Sensitive" : undefined} />
                          ))}
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-ink-3">Locked permissions are ones you do not hold. Only someone who holds them can add or remove them.</p>
                  </fieldset>
                  <div className="flex justify-end">
                    <Button type="submit">Save role</Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          </div>
        </AppFrame>

        <div className="lg:sticky lg:top-16">
          <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
            Sidebar for someone holding only
            <RoleBadge role={{ id: "demo", name: name || role.name, tone }} />
            <span>· {officerOnly > 0 ? `${officerOnly} more item${officerOnly === 1 ? "" : "s"} than a regular member` : "same as a regular member"}</span>
          </p>
          <div className="rounded-lg border border-line bg-surface px-3 py-4">
            <nav aria-label="Sidebar preview" className="space-y-5 sm:grid sm:grid-cols-3 sm:gap-6 sm:space-y-0 lg:block lg:space-y-5">
              {sidebar.map((group, index) => (
                <div key={group.label ?? index}>
                  {group.label ? <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-ink-3">{group.label}</p> : null}
                  <ul className="space-y-px">
                    {group.items.map((item) => (
                      <li key={item.label} className="fade-up flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-ink-2">
                        <item.icon className="size-4 shrink-0 text-ink-3" aria-hidden />
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}

type Visibility = "chapter" | "officers" | "private";
type ProfileField = "pronouns" | "major" | "hometown" | "bio" | "interests" | "phone" | "social_links";

const PROFILE = { pronouns: "he/him", major: "Mechanical engineering", hometown: "St. Louis, MO", bio: "Junior from St. Louis. Intramural basketball and the Thursday study group.", interests: "Basketball, Robotics, Cooking", phone: "(314) 555-0142", instagram: "https://instagram.com/" };

const START_VIS: Record<ProfileField, Visibility> = { pronouns: "chapter", major: "chapter", hometown: "officers", bio: "chapter", interests: "chapter", phone: "officers", social_links: "private" };

function VisibilitySelect({ value, onChange }: { value: Visibility; onChange: (value: Visibility) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value as Visibility)} aria-label="Who can see this" className="h-8 w-36 text-xs">
      <option value="chapter">Chapter members</option>
      <option value="officers">Officers only</option>
      <option value="private">Only me</option>
    </Select>
  );
}

export function PrivacyDemo() {
  const [draft, setDraft] = useState(START_VIS);
  const [vis, setVis] = useState(START_VIS);
  const [saved, setSaved] = useState(false);
  const [viewer, setViewer] = useState<"member" | "officer" | "self">("member");
  const shows = (field: ProfileField) => viewer === "self" || vis[field] === "chapter" || (vis[field] === "officers" && viewer === "officer");
  const set = (field: ProfileField) => (value: Visibility) => { setDraft((current) => ({ ...current, [field]: value })); setSaved(false); };
  const row = (field: ProfileField, label: string, input: React.ReactNode) => (
    <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
      <Field label={label} htmlFor={`pv-${field}`}>{input}</Field>
      <VisibilitySelect value={draft[field]} onChange={set(field)} />
    </div>
  );
  const subline = ["Christopher Nguyen", shows("pronouns") ? PROFILE.pronouns : null, "Active", "Class of 2028"].filter(Boolean).join(" · ");

  return (
    <div>
      <TryIt>Change who can see each detail and press Save profile. Then switch who is looking at the profile on the right.</TryIt>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <AppFrame path="/account" active="directory" nav={false} onReset={() => { setDraft(START_VIS); setVis(START_VIS); setSaved(false); setViewer("member"); }}>
          <MockHeader title="Account settings" />
          <Card>
            <CardHeader title="Profile" description="Your profile is shared with the chapters you belong to." />
            <CardBody>
              <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); setVis(draft); setSaved(true); }}>
                {saved ? <Notice tone="positive">Profile saved.</Notice> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Display name" htmlFor="pv-display" hint="What members see in chat and the directory."><Input id="pv-display" defaultValue="Chris Nguyen" /></Field>
                  <Field label="Full name" htmlFor="pv-full" hint="Used on receipts and officer records."><Input id="pv-full" defaultValue="Christopher Nguyen" /></Field>
                </div>
                <Field label="Graduation year" htmlFor="pv-year" className="sm:w-48"><Input id="pv-year" inputMode="numeric" defaultValue="2028" /></Field>
                <div className="space-y-4 border-t border-line pt-5">
                  <p className="text-sm text-ink-2">Choose who can see each detail.</p>
                  {row("pronouns", "Pronouns", <Input id="pv-pronouns" defaultValue={PROFILE.pronouns} />)}
                  {row("major", "Major", <Input id="pv-major" defaultValue={PROFILE.major} />)}
                  {row("hometown", "Hometown", <Input id="pv-hometown" defaultValue={PROFILE.hometown} />)}
                  {row("bio", "Bio", <Textarea id="pv-bio" defaultValue={PROFILE.bio} className="min-h-20" />)}
                  {row("interests", "Interests", <Input id="pv-interests" defaultValue={PROFILE.interests} />)}
                  {row("phone", "Phone", <Input id="pv-phone" type="tel" defaultValue={PROFILE.phone} />)}
                  <div className="space-y-3">
                    <div className="flex items-end justify-between gap-2">
                      <p className="text-sm font-medium text-ink">Links</p>
                      <VisibilitySelect value={draft.social_links} onChange={set("social_links")} />
                    </div>
                    <Field label="Website" htmlFor="pv-website"><Input id="pv-website" placeholder="https://" /></Field>
                    <Field label="LinkedIn" htmlFor="pv-linkedin"><Input id="pv-linkedin" placeholder="https://" /></Field>
                    <Field label="Instagram" htmlFor="pv-instagram"><Input id="pv-instagram" defaultValue={PROFILE.instagram} placeholder="https://" /></Field>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit">Save profile</Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </AppFrame>

        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            Looking at it as
            <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5" role="tablist" aria-label="Viewer">
              {([["member", "A member"], ["officer", "An officer"], ["self", "Chris"]] as const).map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={viewer === key} onClick={() => setViewer(key)} className={cx("rounded px-3 py-1 transition-colors", viewer === key ? "bg-subtle font-medium text-ink" : "text-ink-3 hover:text-ink")}>{label}</button>
              ))}
            </div>
          </div>
          <AppFrame path="/members/chris-nguyen" active="directory" nav={false}>
            <div className="space-y-6">
              <span className="inline-flex items-center gap-1 text-sm text-ink-2">
                <ArrowLeft className="size-4" aria-hidden />
                Directory
              </span>
              <div className="flex flex-wrap items-start gap-5">
                <Avatar name="Chris Nguyen" size="xl" />
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-2xl font-semibold tracking-tight text-ink">Chris Nguyen</p>
                  <p className="mt-0.5 text-sm text-ink-2">{subline}</p>
                  <div className="mt-2"><Badge tone="positive">In house</Badge></div>
                  <div className="mt-3 flex flex-wrap gap-1.5"><RoleBadge role={{ id: "social", name: "Social chair", tone: "slate" }} /></div>
                </div>
                <span className={buttonClass("secondary", "sm")}>
                  {viewer === "self" ? <Pencil className="size-4" aria-hidden /> : <MessageSquare className="size-4" aria-hidden />}
                  {viewer === "self" ? "Edit profile" : "Message"}
                </span>
              </div>
              <div className="space-y-6">
                <Card>
                  <CardHeader title="About" />
                  <CardBody className="space-y-4">
                    {shows("bio") ? <p className="fade-up whitespace-pre-line text-sm leading-6 text-ink">{PROFILE.bio}</p> : <p className="text-sm text-ink-3">No bio yet.</p>}
                    <DefinitionList
                      items={[
                        ...(shows("major") ? [{ label: "Major", value: PROFILE.major }] : []),
                        ...(shows("hometown") ? [{ label: "Hometown", value: PROFILE.hometown }] : []),
                        { label: "Member since", value: "Sep 3, 2025" },
                      ]}
                    />
                    {shows("interests") ? (
                      <div className="flex flex-wrap gap-1.5">{PROFILE.interests.split(", ").map((i) => <Badge key={i}>{i}</Badge>)}</div>
                    ) : null}
                  </CardBody>
                </Card>
                {shows("phone") || shows("social_links") ? (
                  <Card>
                    <CardHeader title="Contact" />
                    <CardBody>
                      <ul className="space-y-2 text-sm">
                        {shows("phone") ? <li className="fade-up flex items-center gap-2"><Phone className="size-4 text-ink-3" aria-hidden /><span className="text-ink">{PROFILE.phone}</span></li> : null}
                        {shows("social_links") ? <li className="fade-up flex items-center gap-2"><AtSign className="size-4 text-ink-3" aria-hidden /><span className="text-ink">Instagram</span></li> : null}
                      </ul>
                    </CardBody>
                  </Card>
                ) : null}
                <Card>
                  <CardHeader title="Positions" />
                  <CardBody>
                    <ul className="space-y-2 text-sm">
                      <li className="flex justify-between gap-2">
                        <span className="text-ink">Social chair</span>
                        <span className="text-ink-3">Since Jan 12, 2026</span>
                      </li>
                    </ul>
                  </CardBody>
                </Card>
              </div>
            </div>
          </AppFrame>
        </div>
      </div>
    </div>
  );
}
