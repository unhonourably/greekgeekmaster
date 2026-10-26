import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader, Notice } from "@/components/ui";
import { ConfirmSubmit } from "@/components/forms";
import { requireChapter } from "@/lib/auth";
import { listChapterRoles } from "@/lib/roles";
import { permissionOptions } from "@/lib/permission-catalog";
import { deleteRole, saveRole } from "../actions";
import { RoleForm } from "../role-form";

export default async function RolePage({ params, searchParams }: PageProps<"/c/[slug]/settings/roles/[roleId]">) {
  const { slug, roleId } = await params;
  const sp = await searchParams;
  const ctx = await requireChapter(slug, "roles.manage");
  const [roles, permissions] = await Promise.all([listChapterRoles(ctx.chapter.id), permissionOptions(ctx.permissions)]);
  const role = roles.find((r) => r.id === roleId);
  if (!role) notFound();
  const error = typeof sp.error === "string" ? sp.error.slice(0, 200) : null;
  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/c/${slug}/settings/roles`} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        All roles
      </Link>
      {sp.created ? <Notice tone="positive">Role created. Assign it from a member&apos;s page under Members and invitations.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Card>
        <CardHeader title={role.name} description={`${role.holders} current holder${role.holders === 1 ? "" : "s"}`} />
        <CardBody>
          <RoleForm
            action={saveRole.bind(null, slug, role.id)}
            permissions={permissions}
            initial={{ name: role.name, description: role.description, badge_tone: role.badge_tone, is_officer: role.is_officer, permissions: role.permissions }}
            locked={role.is_owner}
          />
        </CardBody>
      </Card>
      {role.kind === "custom" ? (
        <Card>
          <CardHeader title="Delete role" description="Only roles that have never been assigned can be deleted. End assignments instead to keep history." />
          <CardBody>
            <form action={deleteRole.bind(null, slug, role.id)}>
              <ConfirmSubmit message={`Delete ${role.name}?`}>
                <Trash2 className="size-4" aria-hidden />
                Delete role
              </ConfirmSubmit>
            </form>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
