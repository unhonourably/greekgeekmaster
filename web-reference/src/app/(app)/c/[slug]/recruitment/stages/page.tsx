import { forbidden } from "next/navigation";
import { Card, CardBody, CardHeader, Notice, PageHeader, TextLink } from "@/components/ui";
import { deleteStage, saveStage } from "../actions";
import { loadStages, requireRecruitment } from "../data";
import { StageRowForm } from "../forms";

export default async function StagesPage({ params, searchParams }: PageProps<"/c/[slug]/recruitment/stages">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { chapter, can } = await requireRecruitment(slug);
  if (!can("recruitment.manage")) forbidden();
  const stages = await loadStages(chapter.id);
  const error = typeof sp.error === "string" ? sp.error.slice(0, 200) : null;
  return (
    <>
      <PageHeader
        eyebrow={<TextLink href={`/c/${slug}/recruitment`}>Recruitment</TextLink>}
        title="Pipeline stages"
        description="Stages appear left to right by order. The outcome drives the offer and join counts on the board."
      />
      {error ? <Notice tone="danger" className="mb-6 max-w-3xl">{error}</Notice> : null}
      <Card className="max-w-3xl">
        <CardHeader title="Stages" />
        <CardBody className="space-y-3">
          {stages.map((s) => (
            <StageRowForm key={`${s.id}:${s.position}:${s.name}:${s.outcome}`} action={saveStage.bind(null, slug, s.id)} deleteAction={deleteStage.bind(null, slug, s.id)} initial={s} />
          ))}
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-[13px] font-medium text-ink-2">Add a stage</p>
            <StageRowForm key={`new:${stages.length}`} action={saveStage.bind(null, slug, null)} nextPosition={Math.min(99, (stages.at(-1)?.position ?? 0) + 1)} />
          </div>
        </CardBody>
      </Card>
    </>
  );
}
