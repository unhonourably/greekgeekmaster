import { ButtonLink, Card, CardBody, TextLink } from "@/components/ui";
import type { SetupStep } from "@/lib/chapter-setup";

export function SetupProgress({ steps, base }: { steps: SetupStep[]; base: string }) {
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  const next = steps.find((step) => !step.done);
  if (!next) return null;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <Card className="mb-6">
      <CardBody>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink">Chapter setup</p>
          <p className="text-[13px] text-ink-3 tnum">{done} of {steps.length}</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Chapter setup">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-4 text-sm font-medium text-ink">Next: {next.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{next.detail}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {next.preview ? <ButtonLink href={`${base}/settings/billing`} size="sm">Activate subscription</ButtonLink> : <ButtonLink href={next.href} size="sm">Continue</ButtonLink>}
          <TextLink href={`${base}/setup`} className="text-[13px]">All steps</TextLink>
        </div>
      </CardBody>
    </Card>
  );
}
