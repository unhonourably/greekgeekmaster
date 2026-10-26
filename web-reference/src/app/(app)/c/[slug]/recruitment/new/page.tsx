import { notFound } from "next/navigation";
import { Card, CardBody, Notice, PageHeader, TextLink } from "@/components/ui";
import { membershipsWithPermission } from "@/lib/roles";
import { saveProspect } from "../actions";
import { loadStages, memberNames, requireRecruitment } from "../data";
import { ProspectForm } from "../forms";

export default async function NewProspectPage({ params }: PageProps<"/c/[slug]/recruitment/new">) {
  const { slug } = await params;
  const { chapter, can } = await requireRecruitment(slug);
  const stages = await loadStages(chapter.id);
  if (!stages.length) notFound();
  const owners = can("recruitment.manage") ? await memberNames(chapter.id, [...(await membershipsWithPermission(chapter.id, "recruitment.view"))]) : null;
  return (
    <>
      <PageHeader eyebrow={<TextLink href={`/c/${slug}/recruitment`}>Recruitment</TextLink>} title="Add prospect" />
      <Notice className="mb-6 max-w-3xl">
        Only record what the prospect has shared with the chapter. Prospects are not members and have not agreed to the chapter&apos;s terms, so keep notes factual and relevant.
      </Notice>
      <Card className="max-w-3xl">
        <CardBody className="py-6">
          <ProspectForm action={saveProspect.bind(null, slug, null)} owners={owners ? [...owners.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)) : null} />
        </CardBody>
      </Card>
    </>
  );
}
