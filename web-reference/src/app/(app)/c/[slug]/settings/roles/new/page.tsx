import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { requireChapter } from "@/lib/auth";
import { permissionOptions } from "@/lib/permission-catalog";
import { saveRole } from "../actions";
import { RoleForm } from "../role-form";

export default async function NewRolePage({ params }: PageProps<"/c/[slug]/settings/roles/new">) {
  const { slug } = await params;
  const ctx = await requireChapter(slug, "roles.manage");
  const permissions = await permissionOptions(ctx.permissions);
  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/c/${slug}/settings/roles`} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        All roles
      </Link>
      <Card>
        <CardHeader title="New role" />
        <CardBody>
          <RoleForm action={saveRole.bind(null, slug, null)} permissions={permissions} />
        </CardBody>
      </Card>
    </div>
  );
}
