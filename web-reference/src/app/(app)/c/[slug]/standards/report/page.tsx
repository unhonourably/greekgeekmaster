import { SimpleForm } from "@/components/simple-form";
import { Card, CardBody, Notice, PageHeader, TextLink } from "@/components/ui";
import { requestTime } from "@/lib/format";
import { requireModule, todayIn } from "@/lib/modules";
import { INCIDENT_CATEGORY } from "../labels";
import { fileIncident } from "../actions";

export default async function ReportPage({ params }: PageProps<"/c/[slug]/standards/report">) {
  const { slug } = await params;
  const { chapter } = await requireModule(slug, "standards");
  const today = todayIn(chapter.timezone, requestTime());
  return (
    <>
      <PageHeader eyebrow={<TextLink href={`/c/${slug}/standards`}>Standards</TextLink>} title="Report a concern" description="Reports go to chapter officers with the standards permission. Platform staff cannot read them." />
      <div className="max-w-2xl space-y-6">
        <Notice tone="danger" title="If someone is in danger">
          Call 911 or campus police now. This form is not monitored around the clock.
        </Notice>
        <Notice tone="info">
          Chapter reports do not replace your university&apos;s official reporting channels, including Title IX and the dean of students. Officers may be required to share reports with your university or national
          organization.
        </Notice>
        <Card>
          <CardBody>
            <SimpleForm
              action={fileIncident.bind(null, slug)}
              submitLabel="Submit report"
              pendingLabel="Submitting"
              fields={[
                { name: "category", label: "Type of concern", type: "select", options: Object.entries(INCIDENT_CATEGORY).map(([value, label]) => ({ value, label })) },
                { name: "occurred_date", label: "When did it happen?", type: "date", max: today, hint: "Optional", span: "half" },
                { name: "occurred_time", label: "Approximate time", type: "time", hint: "Optional", span: "half" },
                { name: "location", label: "Where", maxLength: 200 },
                { name: "description", label: "What happened", type: "textarea", maxLength: 8000 },
                { name: "people_involved", label: "People involved", type: "textarea", maxLength: 2000, hint: "Optional" },
                {
                  name: "confidential_reporter",
                  label: "Keep my name confidential",
                  type: "checkbox",
                  defaultChecked: true,
                  hint: "Officers see the report without your name. Your account is still stored with it so it can be retained and so you can see its status.",
                },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
