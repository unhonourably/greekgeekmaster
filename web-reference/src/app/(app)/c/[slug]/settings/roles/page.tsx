import Link from "next/link";
import { Plus } from "lucide-react";
import { RoleBadge } from "@/components/people";
import { Badge, ButtonLink, Card, CardHeader, Table, Td, Th, Tr } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { listChapterRoles } from "@/lib/roles";

export default async function RolesPage({ params }: PageProps<"/c/[slug]/settings/roles">) {
  const { slug } = await params;
  const { chapter } = await requireChapter(slug, "roles.manage");
  const roles = await listChapterRoles(chapter.id);
  return (
    <Card>
      <CardHeader
        title="Roles"
        description="Roles decide what officers can see and do. Members without a role can use chat, events, the directory, and their own dues."
        actions={
          <ButtonLink href={`/c/${slug}/settings/roles/new`} size="sm">
            <Plus className="size-4" aria-hidden />
            New role
          </ButtonLink>
        }
      />
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th className="pl-5">Role</Th>
              <Th>Type</Th>
              <Th align="right">Permissions</Th>
              <Th className="pr-5" align="right">Held by</Th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <Tr key={r.id}>
                <Td className="pl-5">
                  <Link href={`/c/${slug}/settings/roles/${r.id}`} className="group block">
                    <RoleBadge role={{ id: r.id, name: r.name, tone: r.badge_tone, is_owner: r.is_owner }} />
                    {r.description ? <span className="mt-1 block max-w-md text-xs text-ink-3 group-hover:text-ink-2">{r.description}</span> : null}
                  </Link>
                </Td>
                <Td>{r.kind === "system" ? <Badge>Standard</Badge> : <Badge tone="info">Custom</Badge>}</Td>
                <Td align="right" className="tnum">{r.permissions.length}</Td>
                <Td className="pr-5 tnum" align="right">{r.holders}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
