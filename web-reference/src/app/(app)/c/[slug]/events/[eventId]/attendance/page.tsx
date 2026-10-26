import { forbidden, notFound } from "next/navigation";
import { Avatar, personName } from "@/components/people";
import { Badge, Card, CardHeader, PageHeader, Stat, StatGrid, Table, Td, TextLink, Th, Tr } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatTime } from "@/lib/format";
import { ATTENDANCE_LABEL, ATTENDANCE_TONE, EVENT_COLUMNS, type AttendanceStatus, type EventRow } from "@/lib/events";
import { MEMBER_CLASS_LABEL, type MemberClass } from "@/lib/permissions";
import { recordAttendance } from "../../actions";
import { AttendanceControl } from "./attendance-row";

type Member = { id: string; user_id: string; member_class: MemberClass; profile: { display_name: string | null; full_name: string | null; avatar_path: string | null } | null };
type Attendance = { id: string; membership_id: string; status: AttendanceStatus; method: "qr" | "manual"; checked_in_at: string };
type Correction = { id: number; attendance_id: string; from_status: string | null; to_status: string; reason: string; created_at: string };

export default async function AttendancePage({ params }: PageProps<"/c/[slug]/events/[eventId]/attendance">) {
  const { slug, eventId } = await params;
  const { chapter, can } = await requireChapter(slug);
  if (!can("attendance.view") && !can("attendance.manage")) forbidden();
  const canManage = can("attendance.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).eq("chapter_id", chapter.id).maybeSingle();
  if (!data) notFound();
  const e = data as EventRow;
  const [{ data: memberData }, { data: attendanceData }, { data: correctionData }] = await Promise.all([
    supabase.from("memberships").select("id, user_id, member_class, profile:profiles!memberships_user_id_fkey(display_name, full_name, avatar_path)").eq("chapter_id", chapter.id).eq("status", "active"),
    supabase.from("event_attendance").select("id, membership_id, status, method, checked_in_at").eq("event_id", e.id),
    supabase.from("attendance_corrections").select("id, attendance_id, from_status, to_status, reason, created_at").eq("chapter_id", chapter.id).order("created_at", { ascending: false }).limit(200),
  ]);
  const members = ((memberData ?? []) as unknown as Member[]).sort((a, b) => personName(a.profile ?? {}).localeCompare(personName(b.profile ?? {})));
  const attendance = new Map(((attendanceData ?? []) as Attendance[]).map((a) => [a.membership_id, a]));
  const attendanceIds = new Set([...attendance.values()].map((a) => a.id));
  const corrections = ((correctionData ?? []) as Correction[]).filter((c) => attendanceIds.has(c.attendance_id));
  const expected = e.attendance_required ? members.filter((m) => e.required_classes.length === 0 || e.required_classes.includes(m.member_class)) : [];
  const expectedIds = new Set(expected.map((m) => m.id));
  const tally = [...attendance.values()].reduce<Record<AttendanceStatus, number>>((acc, a) => ({ ...acc, [a.status]: acc[a.status] + 1 }), { present: 0, late: 0, excused: 0, absent: 0 });
  const missing = expected.filter((m) => !attendance.has(m.id)).length;
  const membershipName = new Map(members.map((m) => [m.id, personName(m.profile ?? {})]));
  const attendanceOwner = new Map([...attendance.values()].map((a) => [a.id, a.membership_id]));

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href={`/c/${slug}/events/${e.id}`}>{e.title}</TextLink>}
        title="Attendance"
        description={canManage ? "Record attendance for anyone who could not scan in. Changing an existing record requires a reason and is kept in the correction log." : undefined}
      />
      <StatGrid className="mb-6">
        <Stat label="Present" value={tally.present} />
        <Stat label="Late" value={tally.late} tone={tally.late ? "warning" : undefined} />
        <Stat label="Excused" value={tally.excused} />
        <Stat label={e.attendance_required ? "Not recorded (required)" : "Absent"} value={e.attendance_required ? missing : tally.absent} tone={e.attendance_required && missing ? "danger" : undefined} />
      </StatGrid>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Status</Th>
              <Th>Recorded</Th>
              {canManage ? <Th align="right">Update</Th> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const a = attendance.get(m.id);
              const name = personName(m.profile ?? {});
              return (
                <Tr key={m.id}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <Avatar name={name} path={m.profile?.avatar_path} size="xs" />
                      <span>
                        <span className="block">{name}</span>
                        <span className="block text-[12px] text-ink-3">
                          {MEMBER_CLASS_LABEL[m.member_class]}
                          {expectedIds.has(m.id) ? " · required" : ""}
                        </span>
                      </span>
                    </span>
                  </Td>
                  <Td>{a ? <Badge tone={ATTENDANCE_TONE[a.status]}>{ATTENDANCE_LABEL[a.status]}</Badge> : <span className="text-[13px] text-ink-3">Not recorded</span>}</Td>
                  <Td className="text-[13px] text-ink-3">{a ? `${a.method === "qr" ? "QR scan" : "Manual"} · ${formatTime(a.checked_in_at, chapter.timezone, true)}` : ""}</Td>
                  {canManage ? (
                    <Td align="right">
                      <AttendanceControl key={a?.status ?? "none"} action={recordAttendance.bind(null, slug, e.id, m.id)} current={a?.status ?? null} />
                    </Td>
                  ) : null}
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      {corrections.length ? (
        <Card className="mt-6">
          <CardHeader title="Correction log" description="Every change to an existing attendance record." />
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Member</Th>
                <Th>Change</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((c) => (
                <Tr key={c.id}>
                  <Td className="whitespace-nowrap text-[13px]">{formatDateTime(c.created_at, chapter.timezone)}</Td>
                  <Td>{membershipName.get(attendanceOwner.get(c.attendance_id) ?? "") ?? "Member"}</Td>
                  <Td className="text-[13px]">
                    {ATTENDANCE_LABEL[c.from_status as AttendanceStatus] ?? "None"} to {ATTENDANCE_LABEL[c.to_status as AttendanceStatus]}
                  </Td>
                  <Td className="text-[13px] text-ink-2">{c.reason}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
